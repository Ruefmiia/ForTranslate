package com.ruefmiia.fortranslate

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private lateinit var overlayChannel: MethodChannel

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        overlayChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            CHANNEL_NAME,
        )
        overlayChannel.setMethodCallHandler { call, result ->
            when (call.method) {
                "status" -> result.success(
                    mapOf(
                        "canDraw" to Settings.canDrawOverlays(this),
                        "running" to OverlayService.isRunning,
                    ),
                )
                "requestPermission" -> {
                    if (Settings.canDrawOverlays(this)) {
                        result.success(true)
                    } else {
                        startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:$packageName"),
                            ),
                        )
                        result.success(false)
                    }
                }
                "start" -> {
                    if (!Settings.canDrawOverlays(this)) {
                        result.success(false)
                    } else {
                        val intent = Intent(this, OverlayService::class.java).apply {
                            action = OverlayService.ACTION_START
                            putExtra(
                                OverlayService.EXTRA_AUTO_TRANSLATE,
                                call.argument<Boolean>("autoTranslate") == true,
                            )
                            putExtra(OverlayService.EXTRA_MODE, call.argument<String>("mode") ?: "server")
                            putExtra(OverlayService.EXTRA_TOKEN, call.argument<String>("token") ?: "")
                            putExtra(OverlayService.EXTRA_LLM_BASE_URL, call.argument<String>("llmBaseUrl") ?: "")
                            putExtra(OverlayService.EXTRA_LLM_MODEL, call.argument<String>("llmModel") ?: "")
                            putExtra(OverlayService.EXTRA_LLM_API_KEY, call.argument<String>("llmApiKey") ?: "")
                        }
                        ContextCompat.startForegroundService(this, intent)
                        result.success(true)
                    }
                }
                "stop" -> {
                    stopService(Intent(this, OverlayService::class.java))
                    result.success(null)
                }
                "consumeLaunchRequest" -> result.success(consumeLaunchRequest(intent))
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val request = consumeLaunchRequest(intent) ?: return
        if (::overlayChannel.isInitialized) {
            overlayChannel.invokeMethod("overlayPaste", request)
        }
    }

    private fun consumeLaunchRequest(source: Intent?): Map<String, Boolean>? {
        if (source?.getBooleanExtra(EXTRA_OVERLAY_PASTE, false) != true) return null
        val request = mapOf(
            "autoTranslate" to source.getBooleanExtra(EXTRA_AUTO_TRANSLATE, false),
        )
        source.removeExtra(EXTRA_OVERLAY_PASTE)
        source.removeExtra(EXTRA_AUTO_TRANSLATE)
        return request
    }

    companion object {
        const val CHANNEL_NAME = "com.ruefmiia.fortranslate/overlay"
        const val EXTRA_OVERLAY_PASTE = "overlay_paste"
        const val EXTRA_AUTO_TRANSLATE = "overlay_auto_translate"
    }
}
