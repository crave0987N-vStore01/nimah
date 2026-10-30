package com.nimah

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pure-Kotlin (no Android classes) audio maths for Nimah's "voice lock".
 *
 * It is a small STATISTICAL voiceprint: 20 MFCCs per voiced 25 ms frame, modelled as one diagonal
 * Gaussian per speaker. It is NOT a neural speaker-embedding model. HONEST LIMITS: it can be fooled by
 * recordings / voice cloning and is affected by noise, so Nimah only uses it as a soft factor and
 * always asks for the phone's own unlock before sensitive actions.
 */
object VoiceDsp {
    const val SR = 16000
    const val DIM = 20
    const val MIN_TRAIN_FRAMES = 250     // ~2.5 s of voiced speech in total
    const val MIN_VERIFY_FRAMES = 40     // ~0.4 s of voiced speech
    private const val FRAME = 400        // 25 ms
    private const val HOP = 160          // 10 ms
    private const val NFFT = 512
    private const val MELS = 26
    private const val ENERGY_FLOOR = 9000.0   // mean-square of int16 samples (RMS ~95): below = silence

    private val window = FloatArray(FRAME) { (0.54 - 0.46 * cos(2.0 * PI * it / (FRAME - 1))).toFloat() }
    private val melBank: Array<FloatArray> = buildMel()
    private val dctScale = sqrt(2.0 / MELS)
    private val dct: Array<DoubleArray> =
        Array(DIM) { k -> DoubleArray(MELS) { n -> dctScale * cos(PI * (k + 1) * (n + 0.5) / MELS) } }

    private fun hzToMel(f: Double) = 2595.0 * log10(1.0 + f / 700.0)
    private fun melToHz(m: Double) = 700.0 * (10.0.pow(m / 2595.0) - 1.0)

    private fun buildMel(): Array<FloatArray> {
        val lo = hzToMel(80.0); val hi = hzToMel(7600.0)
        val pts = DoubleArray(MELS + 2) { melToHz(lo + (hi - lo) * it / (MELS + 1)) }
        val bins = IntArray(MELS + 2) { floor((NFFT + 1) * pts[it] / SR).toInt().coerceIn(0, NFFT / 2) }
        return Array(MELS) { m ->
            val f = FloatArray(NFFT / 2 + 1)
            val l = bins[m]; val c = bins[m + 1]; val r = bins[m + 2]
            if (c > l) for (k in l until c) f[k] = (k - l).toFloat() / (c - l)
            if (r > c) for (k in c..r) f[k] = (r - k).toFloat() / (r - c)
            f
        }
    }

    private fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while ((j and bit) != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) {
                val tr = re[i]; re[i] = re[j]; re[j] = tr
                val ti = im[i]; im[i] = im[j]; im[j] = ti
            }
        }
        var len = 2
        while (len <= n) {
            val ang = -2.0 * PI / len
            val wr = cos(ang); val wi = sin(ang)
            val half = len / 2
            var i = 0
            while (i < n) {
                var cr = 1.0; var ci = 0.0
                for (k in 0 until half) {
                    val a = i + k; val b = a + half
                    val vr = re[b] * cr - im[b] * ci
                    val vi = re[b] * ci + im[b] * cr
                    re[b] = re[a] - vr; im[b] = im[a] - vi
                    re[a] = re[a] + vr; im[a] = im[a] + vi
                    val ncr = cr * wr - ci * wi
                    ci = cr * wi + ci * wr
                    cr = ncr
                }
                i += len
            }
            len = len shl 1
        }
    }

    /** One DIM-vector of MFCCs (c1..c20) per VOICED frame of 16 kHz mono PCM. */
    fun voicedFeatures(pcm: ShortArray): List<FloatArray> {
        if (pcm.size < FRAME) return emptyList()
        val nFrames = (pcm.size - FRAME) / HOP + 1
        val energies = DoubleArray(nFrames)
        for (f in 0 until nFrames) {
            var e = 0.0
            val o = f * HOP
            for (i in 0 until FRAME) { val v = pcm[o + i].toDouble(); e += v * v }
            energies[f] = e / FRAME
        }
        val p95 = energies.sortedArray()[(nFrames * 0.95).toInt().coerceAtMost(nFrames - 1)]
        val gate = max(p95 * 0.1, ENERGY_FLOOR)

        val x = FloatArray(pcm.size)
        x[0] = pcm[0].toFloat()
        for (i in 1 until pcm.size) x[i] = pcm[i] - 0.97f * pcm[i - 1]   // pre-emphasis

        val out = ArrayList<FloatArray>()
        val re = DoubleArray(NFFT); val im = DoubleArray(NFFT); val mel = DoubleArray(MELS)
        for (f in 0 until nFrames) {
            if (energies[f] < gate) continue
            java.util.Arrays.fill(re, 0.0); java.util.Arrays.fill(im, 0.0)
            val o = f * HOP
            for (i in 0 until FRAME) re[i] = (x[o + i] * window[i]).toDouble()
            fft(re, im)
            for (m in 0 until MELS) {
                var s = 0.0
                val fb = melBank[m]
                for (k in 0..NFFT / 2) { val w = fb[k]; if (w != 0f) s += w * (re[k] * re[k] + im[k] * im[k]) }
                mel[m] = ln(s + 1.0)
            }
            val v = FloatArray(DIM)
            for (k in 0 until DIM) { var s = 0.0; for (n in 0 until MELS) s += dct[k][n] * mel[n]; v[k] = s.toFloat() }
            out.add(v)
        }
        return out
    }

    class Model(val mu: FloatArray, val vr: FloatArray)

    fun train(frames: List<FloatArray>): Model? {
        if (frames.size < MIN_TRAIN_FRAMES) return null
        val n = frames.size.toDouble()
        val mu = DoubleArray(DIM); val sq = DoubleArray(DIM)
        for (f in frames) for (k in 0 until DIM) { val x = f[k].toDouble(); mu[k] += x; sq[k] += x * x }
        val m = FloatArray(DIM); val v = FloatArray(DIM)
        for (k in 0 until DIM) {
            val mean = mu[k] / n
            m[k] = mean.toFloat()
            v[k] = max(sq[k] / n - mean * mean, 1e-4).toFloat()
        }
        return Model(m, v)
    }

    /**
     * 0..1 similarity (-1 = not enough speech). d is the mean normalised squared distance of the frames
     * to the enrolled model: ~1 for the same speaker, larger for others. Thresholds are NOT tuned on
     * real data — the in-app test screen lets the user calibrate the sensitivity.
     */
    fun similarity(model: Model, frames: List<FloatArray>): Double {
        if (frames.size < MIN_VERIFY_FRAMES) return -1.0
        var total = 0.0
        for (f in frames) {
            var d = 0.0
            for (k in 0 until DIM) { val z = f[k] - model.mu[k]; d += z * z / model.vr[k] }
            total += d / DIM
        }
        val d = total / frames.size
        return exp(-2.5 * max(0.0, d - 1.0))
    }

    fun encode(m: Model): String = "v1|" + m.mu.joinToString(",") + "|" + m.vr.joinToString(",")

    fun decode(s: String): Model? = try {
        val p = s.split("|")
        if (p.size != 3 || p[0] != "v1") null else {
            val mu = p[1].split(",").map { it.toFloat() }.toFloatArray()
            val vr = p[2].split(",").map { it.toFloat() }.toFloatArray()
            if (mu.size == DIM && vr.size == DIM) Model(mu, vr) else null
        }
    } catch (e: Exception) { null }
}
