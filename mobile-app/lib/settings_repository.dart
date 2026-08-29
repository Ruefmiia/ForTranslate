import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettings {
  const AppSettings({
    required this.baseUrl,
    required this.token,
    required this.resultFontSize,
  });
  final String baseUrl;
  final String token;
  final double resultFontSize;
}

class SettingsRepository {
  static const _defaultUrl = 'http://47.116.136.58:18787';
  const SettingsRepository({FlutterSecureStorage? secureStorage})
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _secureStorage;

  Future<AppSettings> load() async {
    final preferences = await SharedPreferences.getInstance();
    return AppSettings(
      baseUrl: preferences.getString('api_base_url') ?? _defaultUrl,
      token: await _secureStorage.read(key: 'access_token') ?? '',
      resultFontSize: preferences.getDouble('result_font_size') ?? 18,
    );
  }

  Future<void> save(AppSettings settings) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString('api_base_url', settings.baseUrl.trim());
    await preferences.setDouble('result_font_size', settings.resultFontSize);
    await _secureStorage.write(
      key: 'access_token',
      value: settings.token.trim(),
    );
  }
}
