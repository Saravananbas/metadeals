import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'api.dart';

/// Web client id of the Google Cloud project (the backend lists it in GOOGLE_NATIVE_CLIENT_IDS). Empty hides the Google button.
const googleWebClientId = String.fromEnvironment('GOOGLE_WEB_CLIENT_ID');

class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Native Google / Apple sign-in. The provider's own SDK signs the person in; we send its ID token to
/// /api/v1/mobile/auth/* and keep the returned tokens in the phone's secure storage (Keystore / Keychain).
class AppAuth {
  AppAuth._();
  static final instance = AppAuth._();

  static const _storage = FlutterSecureStorage();
  static const _access = 'md_access', _expires = 'md_access_exp', _refresh = 'md_refresh';
  bool _googleReady = false;

  bool get googleAvailable => googleWebClientId.isNotEmpty;
  bool get appleAvailable => Platform.isIOS;

  Future<bool> get signedIn async => (await _storage.read(key: _refresh)) != null;

  Future<void> signInWithGoogle() async {
    if (!_googleReady) {
      await GoogleSignIn.instance.initialize(serverClientId: googleWebClientId);
      _googleReady = true;
    }
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) throw AuthException('Google did not return a sign-in token.');
      await _exchange('google', {'idToken': idToken, 'device': 'Android app'});
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) throw AuthException('Sign-in cancelled.');
      throw AuthException('Google sign-in failed. Please try again.');
    }
  }

  Future<void> signInWithApple() async {
    final random = Random.secure();
    final nonce = base64Url.encode(List<int>.generate(32, (_) => random.nextInt(256)));
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: sha256.convert(utf8.encode(nonce)).toString(),
      );
      final name = [credential.givenName, credential.familyName].whereType<String>().join(' ').trim();
      await _exchange('apple', {'idToken': credential.identityToken, 'nonce': nonce, 'name': name, 'device': 'iPhone app'});
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) throw AuthException('Sign-in cancelled.');
      throw AuthException('Apple sign-in failed. Please try again.');
    }
  }

  Future<void> _exchange(String provider, Map<String, dynamic> body) async {
    final response = await _post('mobile/auth/$provider', body);
    await _save(response);
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final res = await http.post(Uri.parse('$apiBase/api/v1/$path'), headers: {'content-type': 'application/json'}, body: jsonEncode(body)).timeout(const Duration(seconds: 20));
      final json = (jsonDecode(res.body) as Map).cast<String, dynamic>();
      if (res.statusCode >= 400) throw AuthException('${json['error'] ?? 'Sign-in failed. Please try again.'}');
      return (json['data'] as Map).cast<String, dynamic>();
    } on AuthException {
      rethrow;
    } catch (_) {
      throw AuthException('Could not reach MetaDeals4U. Check your connection and try again.');
    }
  }

  Future<void> _save(Map<String, dynamic> data) async {
    await _storage.write(key: _access, value: '${data['token']}');
    await _storage.write(key: _expires, value: '${data['expiresAt']}');
    await _storage.write(key: _refresh, value: '${data['refreshToken']}');
  }

  /// A valid access token, refreshed when it is about to expire; null when signed out or the sign-in has ended.
  Future<String?> accessToken() async {
    final token = await _storage.read(key: _access);
    final expires = DateTime.tryParse(await _storage.read(key: _expires) ?? '');
    if (token != null && expires != null && expires.isAfter(DateTime.now().add(const Duration(minutes: 2)))) return token;
    final refresh = await _storage.read(key: _refresh);
    if (refresh == null) return null;
    try {
      await _save(await _post('mobile/auth/refresh', {'refreshToken': refresh}));
      return await _storage.read(key: _access);
    } catch (_) {
      return null;
    }
  }

  Future<void> signOut() async {
    final token = await _storage.read(key: _access);
    if (token != null) {
      try {
        await http.delete(Uri.parse('$apiBase/api/v1/mobile/auth/session'), headers: {'authorization': 'Bearer $token'}).timeout(const Duration(seconds: 8));
      } catch (_) {/* the token still expires by itself */}
    }
    await _storage.deleteAll();
    if (_googleReady) await GoogleSignIn.instance.signOut().catchError((_) {});
  }
}
