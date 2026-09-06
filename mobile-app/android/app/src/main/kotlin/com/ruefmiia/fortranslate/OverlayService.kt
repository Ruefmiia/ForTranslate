package com.ruefmiia.fortranslate

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import kotlin.math.abs

class OverlayService : Service() {
    private lateinit var windowManager: WindowManager
    private lateinit var params: WindowManager.LayoutParams
    private var overlayView: View? = null
    private var autoTranslate = false
    private var mode = "server"
    private var token = ""
    private var apiUrl = ""
    private var model = ""
    private var apiKey = ""
    private var busy = false

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(2001, notification())
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        overlayView?.let {
            if (::windowManager.isInitialized) windowManager.removeView(it)
        }
        overlayView = null
        isRunning = false
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        autoTranslate = intent?.getBooleanExtra(EXTRA_AUTO_TRANSLATE, false) == true
        mode = intent?.getStringExtra(EXTRA_MODE) ?: mode
        token = intent?.getStringExtra(EXTRA_TOKEN) ?: token
        apiUrl = intent?.getStringExtra(EXTRA_LLM_BASE_URL) ?: apiUrl
        model = intent?.getStringExtra(EXTRA_LLM_MODEL) ?: model
        apiKey = intent?.getStringExtra(EXTRA_LLM_API_KEY) ?: apiKey
        if (overlayView == null) showCollapsed()
        return START_NOT_STICKY
    }

    private fun windowParams(width: Int, height: Int) = WindowManager.LayoutParams(
        width,
        height,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        val position = getSharedPreferences(POSITION_PREFS, MODE_PRIVATE)
        x = position.getInt("x", dp(16))
        y = position.getInt("y", dp(160))
        softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    }

    private fun replace(view: View, width: Int, height: Int) {
        if (!::windowManager.isInitialized) {
            windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        }
        hideKeyboard()
        overlayView?.let { windowManager.removeView(it) }
        params = windowParams(width, height)
        overlayView = view
        windowManager.addView(view, params)
        view.post { clampPositionAndUpdate() }
    }

    private fun showCollapsed() {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = background(Color.rgb(21, 50, 74), 18)
            elevation = dp(6).toFloat()
        }
        val open = TextView(this).apply {
            text = "翻译小窗"
            textSize = 14f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(14), 0, dp(8), 0)
        }
        row.addView(open, LinearLayout.LayoutParams(WRAP, MATCH))
        row.addView(
            iconButton(android.R.drawable.ic_menu_close_clear_cancel, "关闭") { stopSelf() },
            LinearLayout.LayoutParams(dp(40), dp(44)),
        )
        replace(row, WRAP, dp(44))
        installDrag(open) { showExpanded() }
    }

    private fun showExpanded() {
        val savedSize = getSharedPreferences(SIZE_PREFS, MODE_PRIVATE)
        val width = savedSize.getInt("width", dp(328))
        val height = savedSize.getInt("height", dp(360))
        var sourceVisible = savedSize.getBoolean("sourceVisible", true)

        val frame = FrameLayout(this)
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(4), dp(8), dp(6))
            background = background(Color.rgb(251, 252, 254), 12)
            elevation = dp(8).toFloat()
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val dragHandle = TextView(this).apply {
            text = "翻译"
            textSize = 14f
            setTextColor(Color.rgb(21, 50, 74))
            setTypeface(typeface, 1)
            gravity = Gravity.CENTER_VERTICAL
            contentDescription = "拖动翻译小窗"
        }
        val sourceToggle = iconButton(android.R.drawable.ic_menu_view, "隐藏原文") {}
        val collapse = iconButton(android.R.drawable.arrow_down_float, "收起") { showCollapsed() }
        val close = iconButton(android.R.drawable.ic_menu_close_clear_cancel, "关闭") { stopSelf() }
        header.addView(dragHandle, LinearLayout.LayoutParams(0, dp(40), 1f))
        header.addView(sourceToggle, LinearLayout.LayoutParams(dp(40), dp(40)))
        header.addView(collapse, LinearLayout.LayoutParams(dp(40), dp(40)))
        header.addView(close, LinearLayout.LayoutParams(dp(40), dp(40)))

        val input = EditText(this).apply {
            hint = "粘贴需要翻译的文字"
            textSize = 14f
            minLines = 2
            maxLines = 4
            gravity = Gravity.TOP or Gravity.START
            setPadding(dp(8), dp(6), dp(8), dp(6))
            background = background(Color.WHITE, 8)
        }
        val result = TextView(this).apply {
            text = "译文会显示在这里"
            textSize = 15f
            setTextColor(Color.rgb(20, 32, 43))
            setPadding(dp(3), dp(6), dp(3), dp(4))
            setTextIsSelectable(true)
        }
        val resultScroll = ScrollView(this).apply {
            isFillViewport = true
            addView(result, FrameLayout.LayoutParams(MATCH, WRAP))
        }
        val status = TextView(this).apply {
            textSize = 12f
            setTextColor(Color.rgb(83, 103, 117))
            visibility = View.GONE
        }
        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(0, 0, dp(28), 0)
        }
        val paste = textButton("粘贴")
        val translate = textButton("翻译", primary = true)
        val app = textButton("打开 App")
        actions.addView(paste)
        actions.addView(space())
        actions.addView(translate)
        actions.addView(space())
        actions.addView(app)

        card.addView(header, LinearLayout.LayoutParams(MATCH, dp(40)))
        card.addView(input, LinearLayout.LayoutParams(MATCH, WRAP))
        card.addView(resultScroll, LinearLayout.LayoutParams(MATCH, 0, 1f))
        card.addView(status, LinearLayout.LayoutParams(MATCH, WRAP))
        card.addView(actions, LinearLayout.LayoutParams(MATCH, dp(44)))
        frame.addView(card, FrameLayout.LayoutParams(MATCH, MATCH))

        val resizeHandle = TextView(this).apply {
            text = "↘"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(83, 103, 117))
            contentDescription = "拖动调整悬浮窗大小"
        }
        frame.addView(
            resizeHandle,
            FrameLayout.LayoutParams(dp(32), dp(32), Gravity.END or Gravity.BOTTOM),
        )

        fun updateSourceVisibility() {
            input.visibility = if (sourceVisible) View.VISIBLE else View.GONE
            sourceToggle.contentDescription = if (sourceVisible) "隐藏原文" else "显示原文"
            sourceToggle.alpha = if (sourceVisible) 1f else 0.55f
            if (!sourceVisible) releaseInputFocus(input)
        }
        sourceToggle.setOnClickListener {
            sourceVisible = !sourceVisible
            savedSize.edit().putBoolean("sourceVisible", sourceVisible).apply()
            updateSourceVisibility()
        }
        updateSourceVisibility()

        paste.setOnClickListener {
            val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            input.setText(
                clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty(),
            )
            input.setSelection(input.text.length)
            if (autoTranslate && input.text.isNotBlank()) {
                releaseInputFocus(input)
                request(input.text.toString(), result, status, translate)
            }
        }
        translate.setOnClickListener {
            releaseInputFocus(input)
            request(input.text.toString(), result, status, translate)
        }
        app.setOnClickListener { openApp() }
        input.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN) acquireInputFocus(input)
            false
        }
        frame.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) releaseInputFocus(input)
            false
        }

        replace(frame, width, height)
        installDrag(dragHandle) {}
        installResize(resizeHandle)
    }

    private fun request(
        text: String,
        result: TextView,
        status: TextView,
        button: TextView,
    ) {
        if (busy) return
        if (text.isBlank()) {
            status.text = "请先粘贴或输入文字"
            status.visibility = View.VISIBLE
            return
        }
        busy = true
        button.isEnabled = false
        button.alpha = .55f
        status.text = "翻译中…"
        status.visibility = View.VISIBLE
        thread {
            try {
                val value = if (mode == "direct") direct(text) else server(text)
                addHistory(this, text, value)
                runOnUi {
                    result.text = value
                    status.visibility = View.GONE
                }
            } catch (error: Exception) {
                runOnUi {
                    status.text = error.message ?: "翻译失败，请重试"
                    status.visibility = View.VISIBLE
                }
            } finally {
                runOnUi {
                    busy = false
                    button.isEnabled = true
                    button.alpha = 1f
                }
            }
        }
    }

    private fun server(text: String): String {
        if (token.isBlank()) error("请先在 App 设置服务令牌")
        val body = JSONObject()
            .put("text", text)
            .put("context", "")
            .put("source", "android_overlay")
        return post("$SERVICE_URL/v1/translate/text", token, body).getString("translation")
    }

    private fun direct(text: String): String {
        if (apiKey.isBlank() || model.isBlank()) error("请先在 App 完成自有 API 设置")
        val prompt = "把用户文字翻译成自然、准确的简体中文。保留说话人标记、换行、emoji、语气和专有名词，不要省略。术语优先遵循：\n" +
            glossary(text) +
            "\n只返回包含 translation、notes、uncertainties、entities 的 JSON。"
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", prompt))
            .put(JSONObject().put("role", "user").put("content", text))
        val body = JSONObject()
            .put("model", model)
            .put("temperature", .2)
            .put("response_format", JSONObject().put("type", "json_object"))
            .put("messages", messages)
        val response = post(apiUrl.trimEnd('/') + "/chat/completions", apiKey, body)
        val content = response.getJSONArray("choices")
            .getJSONObject(0)
            .getJSONObject("message")
            .getString("content")
        return JSONObject(content).getString("translation")
    }

    private fun glossary(text: String): String {
        val raw = assets.open("flutter_assets/assets/glossary.json")
            .bufferedReader()
            .use { it.readText() }
        val terms = JSONObject(raw).getJSONArray("terms")
        val found = mutableListOf<JSONObject>()
        for (index in 0 until terms.length()) {
            val term = terms.getJSONObject(index)
            if (text.contains(term.getString("source"))) found.add(term)
        }
        return found
            .sortedByDescending { it.getString("source").length }
            .take(40)
            .joinToString("\n") {
                val note = it.optString("note")
                it.getString("source") + " => " + it.getString("target") +
                    if (note.isBlank()) "" else "（$note）"
            }
            .ifBlank { "无匹配术语。" }
    }

    private fun post(address: String, bearer: String, body: JSONObject): JSONObject {
        val connection = URL(address).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000
        connection.setRequestProperty("Authorization", "Bearer $bearer")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true
        connection.outputStream.use {
            it.write(body.toString().toByteArray(Charsets.UTF_8))
        }
        val payload = (if (connection.responseCode in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream
        }).bufferedReader().use { it.readText() }
        if (connection.responseCode !in 200..299) {
            error(JSONObject(payload).optString("detail", "服务返回 ${connection.responseCode}"))
        }
        return JSONObject(payload)
    }

    private fun openApp() {
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
        )
    }

    private fun acquireInputFocus(input: EditText) {
        if (params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE != 0) {
            params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
            windowManager.updateViewLayout(overlayView, params)
        }
        input.post {
            input.requestFocus()
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
                .showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    private fun releaseInputFocus(input: EditText) {
        input.clearFocus()
        hideKeyboard(input)
        if (::params.isInitialized &&
            params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE == 0
        ) {
            params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            windowManager.updateViewLayout(overlayView, params)
        }
    }

    private fun hideKeyboard(target: View? = overlayView) {
        target ?: return
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(target.windowToken, 0)
    }

    private fun installDrag(target: View, onTap: () -> Unit) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        target.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = params.x
                    startY = params.y
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (!dragging &&
                        (abs(event.rawX - downX) > slop || abs(event.rawY - downY) > slop)
                    ) {
                        dragging = true
                    }
                    if (dragging) {
                        params.x = startX + (event.rawX - downX).toInt()
                        params.y = startY + (event.rawY - downY).toInt()
                        clampPositionAndUpdate()
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (dragging) savePosition() else onTap()
                    true
                }
                MotionEvent.ACTION_CANCEL -> {
                    if (dragging) savePosition()
                    true
                }
                else -> false
            }
        }
    }

    private fun installResize(target: View) {
        var downX = 0f
        var downY = 0f
        var startWidth = 0
        var startHeight = 0
        target.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startWidth = overlayView?.width ?: params.width
                    startHeight = overlayView?.height ?: params.height
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val screen = resources.displayMetrics
                    val maxWidth = (screen.widthPixels - params.x - dp(8)).coerceAtLeast(dp(260))
                    val maxHeight = (screen.heightPixels - params.y - dp(24)).coerceAtLeast(dp(220))
                    params.width = (startWidth + event.rawX - downX).toInt()
                        .coerceIn(dp(260), maxWidth)
                    params.height = (startHeight + event.rawY - downY).toInt()
                        .coerceIn(dp(220), maxHeight)
                    windowManager.updateViewLayout(overlayView, params)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    getSharedPreferences(SIZE_PREFS, MODE_PRIVATE)
                        .edit()
                        .putInt("width", params.width)
                        .putInt("height", params.height)
                        .apply()
                    true
                }
                else -> false
            }
        }
    }

    private fun clampPositionAndUpdate() {
        val screen = resources.displayMetrics
        val width = overlayView?.width?.takeIf { it > 0 }
            ?: params.width.takeIf { it > 0 }
            ?: dp(48)
        val height = overlayView?.height?.takeIf { it > 0 }
            ?: params.height.takeIf { it > 0 }
            ?: dp(48)
        params.x = params.x.coerceIn(0, (screen.widthPixels - width).coerceAtLeast(0))
        params.y = params.y.coerceIn(0, (screen.heightPixels - height).coerceAtLeast(0))
        windowManager.updateViewLayout(overlayView, params)
    }

    private fun savePosition() {
        getSharedPreferences(POSITION_PREFS, MODE_PRIVATE)
            .edit()
            .putInt("x", params.x)
            .putInt("y", params.y)
            .apply()
    }

    private fun textButton(label: String, primary: Boolean = false) = TextView(this).apply {
        text = label
        textSize = 13f
        gravity = Gravity.CENTER
        setTextColor(if (primary) Color.WHITE else Color.rgb(21, 50, 74))
        background = background(
            if (primary) Color.rgb(21, 50, 74) else Color.rgb(237, 244, 247),
            8,
        )
        layoutParams = LinearLayout.LayoutParams(WRAP, dp(38))
        setPadding(dp(10), 0, dp(10), 0)
    }

    private fun iconButton(resource: Int, label: String, action: () -> Unit) =
        ImageButton(this).apply {
            setImageResource(resource)
            setColorFilter(Color.rgb(83, 103, 117))
            background = null
            contentDescription = label
            setPadding(dp(8), dp(8), dp(8), dp(8))
            setOnClickListener { action() }
        }

    private fun space() = Space(this).apply {
        layoutParams = LinearLayout.LayoutParams(dp(4), 1)
    }

    private fun background(color: Int, radius: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(radius).toFloat()
        setColor(color)
    }

    private fun createNotificationChannel() {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "快速翻译悬浮窗",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { setShowBadge(false) },
            )
    }

    private fun notification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_edit)
        .setContentTitle("翻译")
        .setContentText("快速翻译悬浮窗正在运行")
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

    private fun runOnUi(block: () -> Unit) = Handler(mainLooper).post(block)

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val ACTION_START = "com.ruefmiia.fortranslate.START_OVERLAY"
        const val EXTRA_AUTO_TRANSLATE = "auto_translate"
        const val EXTRA_MODE = "mode"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_LLM_BASE_URL = "llm_base_url"
        const val EXTRA_LLM_MODEL = "llm_model"
        const val EXTRA_LLM_API_KEY = "llm_api_key"
        private const val SERVICE_URL = "http://47.116.136.58:18787"
        private const val CHANNEL_ID = "fortranslation_overlay"
        private const val POSITION_PREFS = "overlay_position"
        private const val SIZE_PREFS = "overlay_size"
        private const val HISTORY_PREFS = "translation_history"
        private const val HISTORY_KEY = "entries"
        private const val HISTORY_LIMIT = 6
        private const val WRAP = WindowManager.LayoutParams.WRAP_CONTENT
        private const val MATCH = WindowManager.LayoutParams.MATCH_PARENT
        private val historyLock = Any()

        @Volatile
        var isRunning = false
            private set

        fun addHistory(context: Context, source: String, translation: String) {
            val cleanSource = source.trim()
            val cleanTranslation = translation.trim()
            if (cleanSource.isEmpty() || cleanTranslation.isEmpty()) return
            synchronized(historyLock) {
                val previous = readHistory(context)
                val updated = JSONArray().put(
                    JSONObject()
                        .put("source", cleanSource)
                        .put("translation", cleanTranslation)
                        .put("createdAt", System.currentTimeMillis()),
                )
                for (index in 0 until previous.length()) {
                    val entry = previous.optJSONObject(index) ?: continue
                    if (entry.optString("source") == cleanSource &&
                        entry.optString("translation") == cleanTranslation
                    ) {
                        continue
                    }
                    if (updated.length() >= HISTORY_LIMIT) break
                    updated.put(entry)
                }
                context.getSharedPreferences(HISTORY_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(HISTORY_KEY, updated.toString())
                    .apply()
            }
        }

        fun history(context: Context): List<Map<String, Any>> = synchronized(historyLock) {
            val entries = readHistory(context)
            buildList {
                for (index in 0 until minOf(entries.length(), HISTORY_LIMIT)) {
                    val entry = entries.optJSONObject(index) ?: continue
                    add(
                        mapOf(
                            "source" to entry.optString("source"),
                            "translation" to entry.optString("translation"),
                            "createdAt" to entry.optLong("createdAt"),
                        ),
                    )
                }
            }
        }

        private fun readHistory(context: Context): JSONArray {
            val raw = context.getSharedPreferences(HISTORY_PREFS, Context.MODE_PRIVATE)
                .getString(HISTORY_KEY, "[]")
            return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        }
    }
}
