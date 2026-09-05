import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'api_client.dart';
import 'direct_api_client.dart';
import 'models.dart';
import 'overlay_controller.dart';
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
    title: 'ForTranslation翻译',
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
  final _directApi = DirectApiClient();
  final _overlay = OverlayController();
  final _settingsRepository = const SettingsRepository();
  AppSettings _settings = const AppSettings(
    mode: 'server',
    token: '',
    llmBaseUrl: 'https://api.deepseek.com',
    llmModel: 'deepseek-chat',
    llmApiKey: '',
    resultFontSize: 17,
    overlayEnabled: false,
    overlayAutoTranslate: false,
  );
  TranslationResult? _result;
  String? _error;
  bool _loading = false, _ready = false;

  @override
  void initState() {
    super.initState();
    _overlay.setLaunchHandler(
      (request) => _pasteAndMaybeTranslate(request.autoTranslate),
    );
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final value = await _settingsRepository.load();
    if (mounted) {
      setState(() {
        _settings = value;
        _ready = true;
      });
      final request = await _overlay.consumeLaunchRequest();
      if (request != null) await _pasteAndMaybeTranslate(request.autoTranslate);
    }
  }

  Future<void> _pasteAndMaybeTranslate(bool autoTranslate) async {
    await _paste();
    if (autoTranslate && _sourceController.text.trim().isNotEmpty) {
      await _translate();
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
      final value = _settings.usesDirectApi
          ? await _directApi.translate(
              baseUrl: _settings.llmBaseUrl,
              apiKey: _settings.llmApiKey,
              model: _settings.llmModel,
              text: text,
            )
          : await _api.translate(
              baseUrl: SettingsRepository.serviceUrl,
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
      if (value.overlayEnabled) {
        final status = await _overlay.status();
        if (status.canDraw) {
          await _overlay.start(
            autoTranslate: value.overlayAutoTranslate,
            mode: value.mode,
            token: value.token,
            llmBaseUrl: value.llmBaseUrl,
            llmModel: value.llmModel,
            llmApiKey: value.llmApiKey,
          );
        }
      } else {
        await _overlay.stop();
      }
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
            'ForTranslation翻译',
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
        minLines: 4,
        maxLines: 9,
        style: const TextStyle(fontSize: 15, height: 1.4),
        textInputAction: TextInputAction.newline,
        decoration: const InputDecoration(
          hintText: '粘贴需要翻译的文字',
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
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
  late final TextEditingController _token, _llmUrl, _llmModel, _llmKey;
  late String _mode;
  late double _fontSize;
  late bool _overlayEnabled, _overlayAutoTranslate;
  bool _obscure = true, _testing = false;
  bool _balanceLoading = false;
  TokenBalance? _tokenBalance;
  String? _balanceError;
  String _balanceToken = '';
  String _version = '0.3.1';
  @override
  void initState() {
    super.initState();
    _token = TextEditingController(text: widget.initial.token);
    _llmUrl = TextEditingController(text: widget.initial.llmBaseUrl);
    _llmModel = TextEditingController(text: widget.initial.llmModel);
    _llmKey = TextEditingController(text: widget.initial.llmApiKey);
    _mode = widget.initial.mode;
    _fontSize = widget.initial.resultFontSize;
    _overlayEnabled = widget.initial.overlayEnabled;
    _overlayAutoTranslate = widget.initial.overlayAutoTranslate;
    _token.addListener(_handleTokenChanged);
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = info.version);
    });
    if (_mode == 'server' && _token.text.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _refreshBalance());
    }
  }

  AppSettings get _value => AppSettings(
    mode: _mode,
    token: _token.text,
    llmBaseUrl: _llmUrl.text,
    llmModel: _llmModel.text,
    llmApiKey: _llmKey.text,
    resultFontSize: _fontSize,
    overlayEnabled: _overlayEnabled,
    overlayAutoTranslate: _overlayAutoTranslate,
  );

  void _handleTokenChanged() {
    if (_balanceToken == _token.text.trim()) return;
    if (_balanceLoading || _tokenBalance != null || _balanceError != null) {
      setState(() {
        _balanceLoading = false;
        _tokenBalance = null;
        _balanceError = null;
        _balanceToken = '';
      });
    }
  }

  Future<void> _refreshBalance({bool showError = false}) async {
    final token = _token.text.trim();
    if (token.isEmpty) {
      if (showError && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('请先填写访问令牌')));
      }
      return;
    }
    setState(() {
      _balanceLoading = true;
      _balanceError = null;
    });
    try {
      final value = await widget.api.tokenBalance(
        baseUrl: SettingsRepository.serviceUrl,
        token: token,
      );
      if (mounted && token == _token.text.trim()) {
        setState(() {
          _tokenBalance = value;
          _balanceToken = token;
        });
      }
    } on ApiException catch (error) {
      if (mounted && token == _token.text.trim()) {
        setState(() => _balanceError = error.message);
        if (showError) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(error.message)));
        }
      }
    } finally {
      if (mounted && token == _token.text.trim()) {
        setState(() => _balanceLoading = false);
      }
    }
  }

  Future<void> _test() async {
    setState(() => _testing = true);
    try {
      if (_mode == 'server') {
        await widget.api.testConnection(
          baseUrl: SettingsRepository.serviceUrl,
          token: _token.text,
        );
        await _refreshBalance();
      } else {
        await DirectApiClient().translate(
          baseUrl: _llmUrl.text,
          apiKey: _llmKey.text,
          model: _llmModel.text,
          text: '连接测试',
        );
      }
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
    _token.removeListener(_handleTokenChanged);
    _token.dispose();
    _llmUrl.dispose();
    _llmModel.dispose();
    _llmKey.dispose();
    super.dispose();
  }

  String _yuan(double? value) => (value ?? 0).toStringAsFixed(2);

  Widget _tokenBalancePanel() {
    final balance = _balanceToken == _token.text.trim() ? _tokenBalance : null;
    final canRefresh = !_balanceLoading && _token.text.trim().isNotEmpty;
    final primary = balance == null
        ? (_balanceLoading ? '正在查询余额' : '令牌余额')
        : balance.unlimited
        ? '不限额'
        : '¥${_yuan(balance.remainingYuan)}';
    final secondary = balance == null
        ? (_balanceError ?? '填写令牌后可查询当前额度')
        : balance.unlimited
        ? '管理员兼容令牌'
        : '已使用 ¥${_yuan(balance.usedYuan)} / 总额度 ¥${_yuan(balance.quotaYuan)} · ${balance.requests} 次';
    final statusColor = balance?.exhausted == true
        ? AppColors.orange
        : AppColors.navy;

    return Semantics(
      container: true,
      excludeSemantics: true,
      label: '$primary，$secondary',
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
        decoration: BoxDecoration(
          color: AppColors.mist,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    primary,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: balance == null ? 15 : 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    secondary,
                    style: TextStyle(
                      color: _balanceError == null
                          ? AppColors.muted
                          : AppColors.orange,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            if (_balanceLoading)
              const Padding(
                padding: EdgeInsets.all(14),
                child: SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else
              IconButton(
                onPressed: canRefresh
                    ? () => _refreshBalance(showError: true)
                    : null,
                tooltip: '刷新令牌余额',
                icon: const Icon(Icons.refresh_rounded),
              ),
          ],
        ),
      ),
    );
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
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'server', label: Text('服务令牌')),
              ButtonSegment(value: 'direct', label: Text('自有 API')),
            ],
            selected: {_mode},
            onSelectionChanged: (value) {
              setState(() => _mode = value.first);
              if (_mode == 'server' && _token.text.trim().isNotEmpty) {
                _refreshBalance();
              }
            },
          ),
          const SizedBox(height: 16),
          if (_mode == 'server') ...[
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
            _tokenBalancePanel(),
          ],
          if (_mode == 'direct') ...[
            TextField(
              controller: _llmUrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(labelText: 'OpenAI 兼容 API 地址'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _llmModel,
              decoration: const InputDecoration(labelText: '模型名称'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _llmKey,
              obscureText: _obscure,
              enableSuggestions: false,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'API Key'),
            ),
            const SizedBox(height: 8),
            const Text(
              '自有 API 模式会使用随 App 发布的本地术语库；API Key 仅加密保存在本机。',
              style: TextStyle(color: AppColors.muted, height: 1.4),
            ),
          ],
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
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('快速翻译悬浮条'),
            subtitle: const Text('首次启用需授予“显示在其他应用上层”权限'),
            value: _overlayEnabled,
            onChanged: (value) async {
              if (value) {
                final controller = OverlayController();
                var status = await controller.status();
                if (!status.canDraw) await controller.requestPermission();
                status = await controller.status();
                if (!status.canDraw) return;
              }
              setState(() => _overlayEnabled = value);
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('粘贴后自动翻译'),
            value: _overlayAutoTranslate,
            onChanged: _overlayEnabled
                ? (value) => setState(() => _overlayAutoTranslate = value)
                : null,
          ),
          const SizedBox(height: 12),
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
              'ForTranslation翻译 $_version',
              style: const TextStyle(color: AppColors.muted),
            ),
          ),
        ],
      ),
    ),
  );
}
