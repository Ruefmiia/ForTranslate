import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'api_client.dart';
import 'models.dart';
import 'settings_repository.dart';

void main() => runApp(const ForTranslateApp());

class AppColors {
  static const navy = Color(0xFF15324A),
      orange = Color(0xFFD45C2D),
      paper = Color(0xFFFBFCFE),
      mist = Color(0xFFEDF4F7),
      ink = Color(0xFF14202B),
      muted = Color(0xFF536775),
      warning = Color(0xFF8A430C);
}

class ForTranslateApp extends StatelessWidget {
  const ForTranslateApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'ForTranslate',
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.navy,
        primary: AppColors.navy,
        secondary: AppColors.orange,
        surface: AppColors.paper,
      ),
      scaffoldBackgroundColor: AppColors.paper,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.paper,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.navy, width: 2),
        ),
      ),
    ),
    home: const TranslationScreen(),
  );
}

class TranslationScreen extends StatefulWidget {
  const TranslationScreen({super.key});
  @override
  State<TranslationScreen> createState() => _TranslationScreenState();
}

class _TranslationScreenState extends State<TranslationScreen> {
  final _sourceController = TextEditingController();
  final _api = ForTranslateApi();
  final _settingsRepository = const SettingsRepository();
  AppSettings _settings = const AppSettings(
    baseUrl: '',
    token: '',
    resultFontSize: 18,
  );
  TranslationResult? _result;
  String? _error;
  bool _loading = false, _ready = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final value = await _settingsRepository.load();
    if (mounted) {
      setState(() {
        _settings = value;
        _ready = true;
      });
    }
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text != null) _sourceController.text = data!.text!;
  }

  Future<void> _translate() async {
    final text = _sourceController.text.trim();
    if (text.isEmpty) {
      setState(() => _error = '请先输入或粘贴需要翻译的文字');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await _api.translate(
        baseUrl: _settings.baseUrl,
        token: _settings.token,
        text: text,
      );
      if (mounted) setState(() => _result = value);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openSettings() async {
    final value = await Navigator.of(context).push<AppSettings>(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(initial: _settings, api: _api),
      ),
    );
    if (value != null) {
      await _settingsRepository.save(value);
      if (mounted) setState(() => _settings = value);
    }
  }

  @override
  void dispose() {
    _sourceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      titleSpacing: 20,
      title: const Row(
        children: [
          Text(
            'ForTranslate',
            style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.4),
          ),
          SizedBox(width: 6),
          Text(
            '่',
            style: TextStyle(
              color: AppColors.orange,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          onPressed: _openSettings,
          tooltip: '设置',
          icon: const Icon(Icons.tune_rounded),
        ),
        const SizedBox(width: 8),
      ],
    ),
    body: !_ready
        ? const Center(child: CircularProgressIndicator())
        : SafeArea(
            top: false,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final horizontal = constraints.maxWidth >= 720;
                final panels = <Widget>[
                  _sourcePanel(),
                  if (_result != null || _error != null) _resultPanel(),
                ];
                return SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(
                    horizontal ? 32 : 16,
                    8,
                    horizontal ? 32 : 16,
                    32,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 960),
                      child: horizontal
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(child: panels[0]),
                                if (panels.length > 1) ...[
                                  const SizedBox(width: 24),
                                  Expanded(child: panels[1]),
                                ],
                              ],
                            )
                          : Column(
                              children: [
                                panels[0],
                                if (panels.length > 1) ...[
                                  const SizedBox(height: 20),
                                  panels[1],
                                ],
                              ],
                            ),
                    ),
                  ),
                );
              },
            ),
          ),
  );

  Widget _sourcePanel() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(
        '原文',
        style: TextStyle(
          color: AppColors.navy,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 8),
      TextField(
        controller: _sourceController,
        minLines: 7,
        maxLines: 14,
        textInputAction: TextInputAction.newline,
        decoration: const InputDecoration(hintText: '粘贴泰文、英文或其他语种文字'),
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          OutlinedButton.icon(
            onPressed: _loading ? null : _paste,
            icon: const Icon(Icons.content_paste_rounded),
            label: const Text('粘贴'),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _loading ? null : _sourceController.clear,
            child: const Text('清空'),
          ),
          const Spacer(),
          FilledButton.icon(
            onPressed: _loading ? null : _translate,
            icon: _loading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.translate_rounded),
            label: Text(_loading ? '翻译中' : '翻译'),
          ),
        ],
      ),
    ],
  );

  Widget _resultPanel() {
    if (_error != null) {
      return Semantics(
        liveRegion: true,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF1EC),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.orange),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.ink, height: 1.5),
                ),
              ),
            ],
          ),
        ),
      );
    }
    final value = _result!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Text(
              '中文',
              style: TextStyle(
                color: AppColors.navy,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            IconButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: value.translation));
                if (mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(const SnackBar(content: Text('译文已复制')));
                }
              },
              tooltip: '复制译文',
              icon: const Icon(Icons.copy_rounded),
            ),
          ],
        ),
        SelectableText(
          value.translation,
          style: TextStyle(
            fontSize: _settings.resultFontSize,
            height: 1.65,
            color: AppColors.ink,
          ),
        ),
        if (value.notes.isNotEmpty) _details('解释', value.notes),
        if (value.uncertainties.isNotEmpty)
          _details('不确定项', value.uncertainties),
        if (value.entities.isNotEmpty) _details('实体', value.entities),
        if (value.inputTokens + value.outputTokens > 0) ...[
          const SizedBox(height: 12),
          Text(
            'Token ${value.inputTokens} → ${value.outputTokens}',
            style: const TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ],
      ],
    );
  }

  Widget _details(String title, List<String> items) => Theme(
    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
    child: ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 8),
      title: Text(
        '$title（${items.length}）',
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      children: items
          .map(
            (item) => Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  '· $item',
                  style: const TextStyle(height: 1.5, color: AppColors.muted),
                ),
              ),
            ),
          )
          .toList(),
    ),
  );
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.initial, required this.api});
  final AppSettings initial;
  final ForTranslateApi api;
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url, _token;
  late double _fontSize;
  bool _obscure = true, _testing = false;
  String _version = '0.1.0';
  @override
  void initState() {
    super.initState();
    _url = TextEditingController(text: widget.initial.baseUrl);
    _token = TextEditingController(text: widget.initial.token);
    _fontSize = widget.initial.resultFontSize;
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = info.version);
    });
  }

  AppSettings get _value => AppSettings(
    baseUrl: _url.text,
    token: _token.text,
    resultFontSize: _fontSize,
  );
  Future<void> _test() async {
    setState(() => _testing = true);
    try {
      await widget.api.testConnection(baseUrl: _url.text, token: _token.text);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('连接成功')));
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  void dispose() {
    _url.dispose();
    _token.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('设置'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, _value),
          child: const Text('保存'),
        ),
        const SizedBox(width: 8),
      ],
    ),
    body: SafeArea(
      top: false,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            '翻译服务',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.navy,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: '服务地址',
              helperText: '当前部署允许 HTTP 明文传输，请仅连接可信服务器。',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _token,
            obscureText: _obscure,
            enableSuggestions: false,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: '独立访问令牌',
              suffixIcon: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                tooltip: _obscure ? '显示令牌' : '隐藏令牌',
                icon: Icon(
                  _obscure
                      ? Icons.visibility_rounded
                      : Icons.visibility_off_rounded,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _testing ? null : _test,
            icon: _testing
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.wifi_tethering_rounded),
            label: Text(_testing ? '测试中' : '测试连接'),
          ),
          const SizedBox(height: 28),
          Row(
            children: [
              const Expanded(
                child: Text(
                  '中文译文字号',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
              ),
              Text(
                '${_fontSize.round()} pt',
                style: const TextStyle(color: AppColors.muted),
              ),
            ],
          ),
          Slider(
            value: _fontSize,
            min: 16,
            max: 28,
            divisions: 6,
            label: _fontSize.round().toString(),
            onChanged: (value) => setState(() => _fontSize = value),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.mist,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, color: AppColors.warning),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'HTTP 会以明文传输原文、译文和令牌。当前模式仅适合已确认可信的小范围使用。',
                    style: TextStyle(height: 1.5, color: AppColors.ink),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'ForTranslate $_version',
              style: const TextStyle(color: AppColors.muted),
            ),
          ),
        ],
      ),
    ),
  );
}
