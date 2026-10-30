package com.nimah

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small encrypted key/value store. Values are encrypted with an AES-256-GCM key that lives in the
 * Android Keystore (it never leaves secure hardware/OS storage); only the ciphertext is written
 * to SharedPreferences. Used for API keys instead of plain-text AsyncStorage.
 */
object SecureStore {
    private const val ALIAS = "nimah_secure_key_v1"
    private const val PREFS = "nimah_secure"

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun put(ctx: Context, name: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ct = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val packed = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(ct, Base64.NO_WRAP)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(name, packed).apply()
    }

    /** Returns null when missing or when it cannot be decrypted (e.g. keystore was reset). */
    fun get(ctx: Context, name: String): String? = try {
        val packed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(name, null)
        if (packed == null) null else {
            val parts = packed.split(":")
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val ct = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        }
    } catch (e: Exception) { null }

    fun remove(ctx: Context, name: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(name).apply()
    }
}
