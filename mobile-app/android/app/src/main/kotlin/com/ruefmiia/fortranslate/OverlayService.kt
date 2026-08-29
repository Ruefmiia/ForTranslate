package com.ruefmiia.fortranslate

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class OverlayService : Service() {
    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var autoTranslate = false

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        autoTranslate = intent?.getBooleanExtra(EXTRA_AUTO_TRANSLATE, false) == true
        if (overlayView == null) showOverlay()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        overlayView?.let { windowManager.removeView(it) }
        overlayView = null
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun showOverlay() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val preferences = getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE)
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            dp(48),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = preferences.getInt(PREFERENCE_X, dp(16))
            y = preferences.getInt(PREFERENCE_Y, dp(160))
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            elevation = dp(6).toFloat()
            background = roundedBackground()
            setPadding(dp(6), 0, dp(2), 0)
        }
        val action = TextView(this).apply {
            text = "粘贴并打开"
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(dp(12), 0, dp(10), 0)
            contentDescription = "粘贴剪贴板文字并打开 ForTranslation翻译"
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.MATCH_PARENT,
            )
        }
        val close = ImageButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setColorFilter(Color.WHITE)
            background = null
            contentDescription = "关闭快速翻译悬浮条"
            setOnClickListener { stopSelf() }
            layoutParams = LinearLayout.LayoutParams(dp(48), dp(48))
        }
        container.addView(action)
        container.addView(close)
        installDragAndClick(action, params)
        overlayView = container
        windowManager.addView(container, params)
    }

    private fun installDragAndClick(action: TextView, params: WindowManager.LayoutParams) {
        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startY = 0
        action.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX
                    downRawY = event.rawY
                    startX = params.x
                    startY = params.y
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (event.rawX - downRawX).toInt()
                    params.y = startY + (event.rawY - downRawY).toInt()
                    windowManager.updateViewLayout(overlayView, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val moved = abs(event.rawX - downRawX) > touchSlop ||
                        abs(event.rawY - downRawY) > touchSlop
                    if (moved) savePosition(params) else openApp()
                    true
                }
                else -> false
            }
        }
    }

    private fun savePosition(params: WindowManager.LayoutParams) {
        getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE).edit()
            .putInt(PREFERENCE_X, params.x)
            .putInt(PREFERENCE_Y, params.y)
            .apply()
    }

    private fun openApp() {
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(MainActivity.EXTRA_OVERLAY_PASTE, true)
                putExtra(MainActivity.EXTRA_AUTO_TRANSLATE, autoTranslate)
            },
        )
    }

    private fun roundedBackground() = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(18).toFloat()
        setColor(Color.rgb(21, 50, 74))
        setStroke(dp(1), Color.argb(55, 255, 255, 255))
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "快速翻译悬浮条",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "保持用户启用的快速翻译悬浮条运行"
                setShowBadge(false)
            },
        )
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_edit)
        .setContentTitle("ForTranslation翻译")
        .setContentText("快速翻译悬浮条正在运行")
        .setOngoing(true)
        .setContentIntent(
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
        .build()

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_START = "com.ruefmiia.fortranslate.START_OVERLAY"
        const val EXTRA_AUTO_TRANSLATE = "auto_translate"
        private const val CHANNEL_ID = "fortranslation_overlay"
        private const val NOTIFICATION_ID = 2001
        private const val PREFERENCES_NAME = "overlay_position"
        private const val PREFERENCE_X = "x"
        private const val PREFERENCE_Y = "y"

        @Volatile
        var isRunning = false
            private set
    }
}
