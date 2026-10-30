package com.nimah

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/** Records 16 kHz mono PCM into memory (never written to disk, never uploaded). */
class VoiceCapture(private val maxSeconds: Int) {
    private val buf = ShortArray(VoiceDsp.SR * maxSeconds)
    @Volatile private var n = 0
    @Volatile private var running = false
    private var rec: AudioRecord? = null
    private var thread: Thread? = null

    @SuppressLint("MissingPermission")
    fun start(): Boolean {
        return try {
            val min = AudioRecord.getMinBufferSize(VoiceDsp.SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (min <= 0) return false
            val r = AudioRecord(MediaRecorder.AudioSource.MIC, VoiceDsp.SR, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, min * 2)
            if (r.state != AudioRecord.STATE_INITIALIZED) { r.release(); return false }
            rec = r
            r.startRecording()
            running = true
            thread = Thread {
                val chunk = ShortArray(1024)
                while (running && n < buf.size) {
                    val got = r.read(chunk, 0, chunk.size)
                    if (got <= 0) break
                    val take = minOf(got, buf.size - n)
                    System.arraycopy(chunk, 0, buf, n, take)
                    n += take
                }
            }.also { it.start() }
            true
        } catch (e: Exception) { false }
    }

    /** Stops recording and returns what was captured. */
    fun stop(): ShortArray {
        running = false
        try { thread?.join(400) } catch (e: InterruptedException) {}
        try { rec?.stop() } catch (e: Exception) {}
        try { rec?.release() } catch (e: Exception) {}
        rec = null
        return buf.copyOf(n)
    }
}

/** Enrolment + verification on top of [VoiceDsp]. The model is stored encrypted via [SecureStore]. */
object VoicePrint {
    private const val KEY = "voiceprint.v1"
    private val frames = ArrayList<FloatArray>()

    fun isEnrolled(ctx: Context) = VoiceDsp.decode(SecureStore.get(ctx, KEY) ?: "") != null

    fun addSample(pcm: ShortArray): Int {
        val f = VoiceDsp.voicedFeatures(pcm)
        synchronized(frames) {
            frames.addAll(f)
            while (frames.size > 8000) frames.removeAt(0)
        }
        return f.size
    }

    fun total(): Int = synchronized(frames) { frames.size }

    fun finish(ctx: Context): Boolean {
        val model = synchronized(frames) { VoiceDsp.train(frames) } ?: return false
        SecureStore.put(ctx, KEY, VoiceDsp.encode(model))
        reset()
        return true
    }

    fun reset() { synchronized(frames) { frames.clear() } }

    fun delete(ctx: Context) { reset(); SecureStore.remove(ctx, KEY) }

    /** 0..1, or -1 when there is no voiceprint or not enough speech. */
    fun score(ctx: Context, pcm: ShortArray): Double {
        val model = VoiceDsp.decode(SecureStore.get(ctx, KEY) ?: "") ?: return -1.0
        return VoiceDsp.similarity(model, VoiceDsp.voicedFeatures(pcm))
    }
}
