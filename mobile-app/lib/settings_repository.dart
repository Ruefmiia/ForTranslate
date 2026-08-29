import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettings {
  const AppSettings({
    required this.mode,
    required this.token,
    required this.llmBaseUrl,
    required this.llmModel,
    required this.llmApiKey,
    required this.resultFontSize,
    required this.overlayEnabled,
    required this.overlayAutoTranslate,
  });
  final String mode;
  final String token;
  final String llmBaseUrl;
  final String llmModel;
  final String llmApiKey;
  final double resultFontSize;
  final bool overlayEnabled;
  final bool overlayAutoTranslate;
  bool get usesDirectApi => mode == 'direct';
}

class SettingsRepository {
  // Hidden from the settings UI; server-side tokens remain the security layer.
  static const serviceUrl = 'http://47.116.136.58:18787';
  const SettingsRepository({FlutterSecureStorage? secureStorage})
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _secureStorage;

  Future<AppSettings> load() async {
    final preferences = await SharedPreferences.getInstance();
    return AppSettings(
      mode: preferences.getString('translation_mode') ?? 'server',
      token: await _secureStorage.read(key: 'access_token') ?? '',
      llmBaseUrl:
          preferences.getString('llm_base_url') ?? 'https://api.deepseek.com',
      llmModel: preferences.getString('llm_model') ?? 'deepseek-chat',
      llmApiKey: await _secureStorage.read(key: 'llm_api_key') ?? '',
      resultFontSize: preferences.getDouble('result_font_size') ?? 17,
      overlayEnabled: preferences.getBool('overlay_enabled') ?? false,
      overlayAutoTranslate:
          preferences.getBool('overlay_auto_translate') ?? false,
    );
  }

  Future<void> save(AppSettings settings) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString('translation_mode', settings.mode);
    await preferences.setString('llm_base_url', settings.llmBaseUrl.trim());
    await preferences.setString('llm_model', settings.llmModel.trim());
    await preferences.setDouble('result_font_size', settings.resultFontSize);
    await preferences.setBool('overlay_enabled', settings.overlayEnabled);
    await preferences.setBool(
      'overlay_auto_translate',
      settings.overlayAutoTranslate,
    );
    await _secureStorage.write(
      key: 'access_token',
      value: settings.token.trim(),
    );
    await _secureStorage.write(
      key: 'llm_api_key',
      value: settings.llmApiKey.trim(),
    );
  }
}
