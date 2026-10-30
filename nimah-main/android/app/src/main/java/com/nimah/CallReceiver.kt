package com.nimah

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.ContactsContract
import android.net.Uri
import android.telephony.TelephonyManager

/** Tells JS when the phone rings (needs READ_PHONE_STATE; the caller's number also needs READ_CALL_LOG). */
class CallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val st = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        CallState.update(ctx.applicationContext, st, intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER))
    }
}

object CallState {
    @Volatile var onChange: ((String, String, String) -> Unit)? = null
    private var lastState = ""
    private var lastNumber = ""

    fun update(ctx: Context, raw: String, num: String?) {
        val state = when (raw) { TelephonyManager.EXTRA_STATE_RINGING -> "RINGING"; TelephonyManager.EXTRA_STATE_OFFHOOK -> "OFFHOOK"; else -> "IDLE" }
        val number = num ?: if (state == "RINGING") lastNumber else ""
        // Android sends RINGING twice (first without the number): report again only when something new is known.
        if (state == lastState && number == lastNumber) return
        lastState = state; lastNumber = number
        onChange?.invoke(state, number, if (number.isEmpty()) "" else nameFor(ctx, number))
    }

    private fun nameFor(ctx: Context, number: String): String = try {
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        ctx.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else ""
        } ?: ""
    } catch (e: Exception) { "" }
}
