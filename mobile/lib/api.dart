import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

/// Set with --dart-define=API_BASE=https://metadeals4u.in when building for production.
const String apiBase = String.fromEnvironment('API_BASE', defaultValue: 'https://staging.metadeals4u.in');

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class Api {
  Api({http.Client? client, String? base})
      : _client = client ?? http.Client(),
        base = base ?? apiBase;

  final http.Client _client;
  final String base;

  Uri _uri(String path, [Map<String, String>? query]) => Uri.parse('$base/api/v1/mobile/$path').replace(queryParameters: query);

  Future<Map<String, dynamic>> _get(Uri uri) async {
    try {
      final response = await _client.get(uri, headers: {'Accept': 'application/json'}).timeout(const Duration(seconds: 20));
      if (response.statusCode == 404) throw ApiException('Not found.');
      if (response.statusCode != 200) throw ApiException('The server had a problem. Please try again.');
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      return body is Map<String, dynamic> ? body : throw ApiException('Unexpected answer from the server.');
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('Could not reach MetaDeals4U. Check your connection.');
    }
  }

  Future<DealPage> deals({String q = '', String category = '', String? cursor, String view = 'top'}) async {
    final query = <String, String>{'limit': '15', 'view': view};
    if (q.trim().isNotEmpty) query['q'] = q.trim();
    if (category.isNotEmpty) query['category'] = category;
    if (cursor != null) query['cursor'] = cursor;
    final body = await _get(_uri('deals', query));
    final list = (body['data'] as List? ?? const []).whereType<Map>().map((e) => Deal.fromJson(e.cast<String, dynamic>())).toList();
    return DealPage(list, body['nextCursor'] as String?);
  }

  Future<Deal> deal(String slug) async {
    final body = await _get(_uri('deals/${Uri.encodeComponent(slug)}'));
    return Deal.fromJson((body['data'] as Map).cast<String, dynamic>());
  }

  Future<List<Category>> categories() async {
    final body = await _get(_uri('categories'));
    return (body['data'] as List? ?? const []).whereType<Map>().map((e) => Category.fromJson(e.cast<String, dynamic>())).toList();
  }

  /// Buy Now links must point at MetaDeals4U's own redirect (/go/...), never anywhere else.
  bool isTrustedOutbound(String url) {
    final uri = Uri.tryParse(url);
    final host = Uri.tryParse(base)?.host;
    return uri != null && uri.scheme == 'https' && host != null && uri.host == host && uri.path.startsWith('/go/');
  }
}
