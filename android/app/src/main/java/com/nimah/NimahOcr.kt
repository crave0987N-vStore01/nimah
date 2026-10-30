package com.nimah

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * On-device OCR (Google ML Kit, bundled Latin model, no network).
 * HONEST LIMIT: ML Kit text recognition does NOT support Sinhala script. Sinhala screens are read from
 * the accessibility node text, or by Gemini vision on a screenshot.
 */
object NimahOcr {
    class Line(val text: String, val x: Int, val y: Int, val w: Int, val h: Int)

    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    fun recognize(bitmap: Bitmap, done: (List<Line>?) -> Unit) {
        try {
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { result ->
                    val out = ArrayList<Line>()
                    for (block in result.textBlocks) for (line in block.lines) {
                        val b = line.boundingBox ?: continue
                        val t = line.text.trim()
                        if (t.isNotEmpty()) out.add(Line(t, b.centerX(), b.centerY(), b.width(), b.height()))
                    }
                    done(out)
                }
                .addOnFailureListener { done(null) }
        } catch (e: Exception) { done(null) }
    }
}
