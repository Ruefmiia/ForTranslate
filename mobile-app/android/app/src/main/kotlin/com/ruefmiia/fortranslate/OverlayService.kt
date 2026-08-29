package com.ruefmiia.fortranslate

import android.app.*
import android.content.*
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.IBinder
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import kotlin.math.abs

class OverlayService : Service() {
    private lateinit var wm: WindowManager
    private lateinit var params: WindowManager.LayoutParams
    private var view: View? = null
    private var auto = false
    private var mode = "server"
    private var token = ""
    private var apiUrl = ""
    private var model = ""
    private var apiKey = ""
    private var busy = false

    override fun onCreate() { super.onCreate(); isRunning=true; channel(); startForeground(2001,notification()) }
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onDestroy(){view?.let{wm.removeView(it)};view=null;isRunning=false;super.onDestroy()}
    override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int {
        if(!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY}
        auto=i?.getBooleanExtra(EXTRA_AUTO_TRANSLATE,false)==true
        mode=i?.getStringExtra(EXTRA_MODE)?:mode;token=i?.getStringExtra(EXTRA_TOKEN)?:token
        apiUrl=i?.getStringExtra(EXTRA_LLM_BASE_URL)?:apiUrl;model=i?.getStringExtra(EXTRA_LLM_MODEL)?:model;apiKey=i?.getStringExtra(EXTRA_LLM_API_KEY)?:apiKey
        if(view==null) collapsed()
        return START_NOT_STICKY
    }

    private fun windowParams(w:Int,h:Int)=WindowManager.LayoutParams(w,h,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT).apply{
        gravity=Gravity.TOP or Gravity.START;val p=getSharedPreferences("overlay_position",MODE_PRIVATE);x=p.getInt("x",dp(16));y=p.getInt("y",dp(160));softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    }
    private fun replace(v:View,w:Int,h:Int){if(!::wm.isInitialized)wm=getSystemService(WINDOW_SERVICE) as WindowManager;view?.let{wm.removeView(it)};params=windowParams(w,h);view=v;wm.addView(v,params)}

    private fun collapsed(){
        val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=bg(Color.rgb(21,50,74),20);elevation=dp(6).toFloat()}
        val open=TextView(this).apply{text="翻译小窗";textSize=14f;setTextColor(Color.WHITE);gravity=Gravity.CENTER;setPadding(dp(16),0,dp(12),0)}
        row.addView(open,LinearLayout.LayoutParams(WRAP,MATCH));row.addView(icon(android.R.drawable.ic_menu_close_clear_cancel,"关闭"){stopSelf()},LinearLayout.LayoutParams(dp(48),dp(48)))
        replace(row,WRAP,dp(48));drag(open){expanded()}
    }

    private fun expanded(){
        val card=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(12));background=bg(Color.rgb(251,252,254),18);elevation=dp(10).toFloat()}
        val header=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
        val handle=TextView(this).apply{text="翻译";textSize=14f;setTextColor(Color.rgb(21,50,74));setTypeface(typeface,1);gravity=Gravity.CENTER_VERTICAL;contentDescription="拖动翻译小窗"}
        header.addView(handle,LinearLayout.LayoutParams(0,dp(48),1f));header.addView(icon(android.R.drawable.arrow_down_float,"收起"){collapsed()},LinearLayout.LayoutParams(dp(48),dp(48)));header.addView(icon(android.R.drawable.ic_menu_close_clear_cancel,"关闭"){stopSelf()},LinearLayout.LayoutParams(dp(48),dp(48)))
        val input=EditText(this).apply{hint="粘贴需要翻译的文字";textSize=14f;minLines=2;maxLines=4;gravity=Gravity.TOP or Gravity.START;setPadding(dp(10),dp(8),dp(10),dp(8));background=bg(Color.WHITE,12)}
        val result=TextView(this).apply{text="译文会显示在这里";textSize=15f;setTextColor(Color.rgb(20,32,43));maxLines=6;setPadding(dp(4),dp(10),dp(4),dp(6));setTextIsSelectable(true)}
        val status=TextView(this).apply{textSize=12f;setTextColor(Color.rgb(83,103,117));visibility=View.GONE}
        val actions=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.END or Gravity.CENTER_VERTICAL}
        val paste=button("粘贴");val translate=button("翻译",true);val app=button("打开 App")
        actions.addView(paste);actions.addView(space());actions.addView(translate);actions.addView(space());actions.addView(app)
        paste.setOnClickListener{val cb=getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager;input.setText(cb.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty());input.setSelection(input.text.length);if(auto&&input.text.isNotBlank())request(input.text.toString(),result,status,translate)}
        translate.setOnClickListener{request(input.text.toString(),result,status,translate)}
        app.setOnClickListener{openApp()}
        card.addView(header);card.addView(input,LinearLayout.LayoutParams(MATCH,WRAP));card.addView(result,LinearLayout.LayoutParams(MATCH,WRAP));card.addView(status,LinearLayout.LayoutParams(MATCH,WRAP));card.addView(actions,LinearLayout.LayoutParams(MATCH,dp(48)))
        replace(card,dp(328),WRAP);drag(handle){}
    }

    private fun request(text:String,result:TextView,status:TextView,button:TextView){
        if(busy)return;if(text.isBlank()){status.text="请先粘贴或输入文字";status.visibility=View.VISIBLE;return}
        busy=true;button.isEnabled=false;button.alpha=.55f;status.text="翻译中…";status.visibility=View.VISIBLE
        thread{try{val value=if(mode=="direct")direct(text) else server(text);ui{result.text=value;status.visibility=View.GONE}}catch(e:Exception){ui{status.text=e.message?:"翻译失败，请重试";status.visibility=View.VISIBLE}}finally{ui{busy=false;button.isEnabled=true;button.alpha=1f}}}
    }
    private fun server(text:String):String{if(token.isBlank())error("请先在 App 设置服务令牌");val body=JSONObject().put("text",text).put("context","").put("source","android_overlay");return post("$SERVICE_URL/v1/translate/text",token,body).getString("translation")}
    private fun direct(text:String):String{
        if(apiKey.isBlank()||model.isBlank())error("请先在 App 完成自有 API 设置")
        val prompt="把用户文字翻译成自然、准确的简体中文。保留说话人标记、换行、emoji、语气和专有名词，不要省略。术语优先遵循：\n"+glossary(text)+"\n只返回包含 translation、notes、uncertainties、entities 的 JSON。"
        val messages=JSONArray().put(JSONObject().put("role","system").put("content",prompt)).put(JSONObject().put("role","user").put("content",text))
        val body=JSONObject().put("model",model).put("temperature",.2).put("response_format",JSONObject().put("type","json_object")).put("messages",messages)
        val response=post(apiUrl.trimEnd('/')+"/chat/completions",apiKey,body)
        return JSONObject(response.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")).getString("translation")
    }
    private fun glossary(text:String):String{
        val raw=assets.open("flutter_assets/assets/glossary.json").bufferedReader().use{it.readText()};val terms=JSONObject(raw).getJSONArray("terms");val found=mutableListOf<JSONObject>()
        for(i in 0 until terms.length()){val t=terms.getJSONObject(i);if(text.contains(t.getString("source")))found.add(t)}
        return found.sortedByDescending{it.getString("source").length}.take(40).joinToString("\n"){val n=it.optString("note");it.getString("source")+" => "+it.getString("target")+if(n.isBlank())"" else "（"+n+"）"}.ifBlank{"无匹配术语。"}
    }
    private fun post(address:String,bearer:String,body:JSONObject):JSONObject{
        val c=URL(address).openConnection() as HttpURLConnection;c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=60000;c.setRequestProperty("Authorization","Bearer $bearer");c.setRequestProperty("Content-Type","application/json");c.doOutput=true;c.outputStream.use{it.write(body.toString().toByteArray(Charsets.UTF_8))}
        val payload=(if(c.responseCode in 200..299)c.inputStream else c.errorStream).bufferedReader().use{it.readText()};if(c.responseCode !in 200..299)error(JSONObject(payload).optString("detail","服务返回 "+c.responseCode));return JSONObject(payload)
    }
    private fun openApp(){startActivity(Intent(this,MainActivity::class.java).apply{flags=Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP})}
    private fun drag(v:View,onTap:()->Unit){val slop=ViewConfiguration.get(this).scaledTouchSlop;var dx=0f;var dy=0f;var sx=0;var sy=0;v.setOnTouchListener{_,e->when(e.actionMasked){MotionEvent.ACTION_DOWN->{dx=e.rawX;dy=e.rawY;sx=params.x;sy=params.y;true};MotionEvent.ACTION_MOVE->{params.x=sx+(e.rawX-dx).toInt();params.y=sy+(e.rawY-dy).toInt();wm.updateViewLayout(view,params);true};MotionEvent.ACTION_UP->{val moved=abs(e.rawX-dx)>slop||abs(e.rawY-dy)>slop;if(moved)getSharedPreferences("overlay_position",MODE_PRIVATE).edit().putInt("x",params.x).putInt("y",params.y).apply() else onTap();true};else->false}}}
    private fun button(label:String,primary:Boolean=false)=TextView(this).apply{text=label;textSize=13f;gravity=Gravity.CENTER;setTextColor(if(primary)Color.WHITE else Color.rgb(21,50,74));background=bg(if(primary)Color.rgb(21,50,74) else Color.rgb(237,244,247),10);layoutParams=LinearLayout.LayoutParams(WRAP,dp(40));setPadding(dp(12),0,dp(12),0)}
    private fun icon(res:Int,label:String,action:()->Unit)=ImageButton(this).apply{setImageResource(res);setColorFilter(Color.rgb(83,103,117));background=null;contentDescription=label;setOnClickListener{action()}}
    private fun space()=Space(this).apply{layoutParams=LinearLayout.LayoutParams(dp(6),1)}
    private fun bg(color:Int,r:Int)=GradientDrawable().apply{shape=GradientDrawable.RECTANGLE;cornerRadius=dp(r).toFloat();setColor(color)}
    private fun channel(){(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL_ID,"快速翻译悬浮窗",NotificationManager.IMPORTANCE_LOW).apply{setShowBadge(false)})}
    private fun notification()=NotificationCompat.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_menu_edit).setContentTitle("ForTranslation翻译").setContentText("快速翻译悬浮窗正在运行").setOngoing(true).setContentIntent(PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
    private fun ui(block:()->Unit)=android.os.Handler(mainLooper).post(block)
    private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
    companion object{
        const val ACTION_START="com.ruefmiia.fortranslate.START_OVERLAY";const val EXTRA_AUTO_TRANSLATE="auto_translate";const val EXTRA_MODE="mode";const val EXTRA_TOKEN="token";const val EXTRA_LLM_BASE_URL="llm_base_url";const val EXTRA_LLM_MODEL="llm_model";const val EXTRA_LLM_API_KEY="llm_api_key"
        private const val SERVICE_URL="http://47.116.136.58:18787";private const val CHANNEL_ID="fortranslation_overlay";private const val WRAP=WindowManager.LayoutParams.WRAP_CONTENT;private const val MATCH=WindowManager.LayoutParams.MATCH_PARENT
        @Volatile var isRunning=false;private set
    }
}
