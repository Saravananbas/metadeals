import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:metadeals4u_app/api.dart';
import 'package:metadeals4u_app/models.dart';
import 'package:metadeals4u_app/web_tab.dart';
import 'package:metadeals4u_app/widgets.dart';

void main() {
  test('deal JSON from the mobile API is parsed', () {
    final deal = Deal.fromJson({
      'id': 'd1', 'slug': 'phone-1', 'title': 'Phone', 'brand': 'B', 'category': 'Mobiles',
      'merchant': {'name': 'Flipkart', 'slug': 'flipkart'}, 'price': 16749, 'mrp': 19261, 'discountPercent': 13,
      'imageUrl': 'https://x/y.webp', 'imageGallery': ['https://x/z.webp'], 'rating': 4.0, 'reviewCount': 14,
      'outboundUrl': 'https://staging.metadeals4u.in/go/phone-1?c=mobile', 'expiresAt': null,
    });
    expect(deal.savings, 2512);
    expect(deal.merchantName, 'Flipkart');
    expect(Deal.fromJson(deal.toJson()).title, 'Phone');
  });

  test('rupees use Indian grouping', () {
    expect(rupees(999), '₹999');
    expect(rupees(16749), '₹16,749');
    expect(rupees(1250000), '₹12,50,000');
  });

  test('Buy Now only trusts our own https /go links', () {
    final api = Api(base: 'https://staging.metadeals4u.in');
    expect(api.isTrustedOutbound('https://staging.metadeals4u.in/go/x?c=mobile'), isTrue);
    expect(api.isTrustedOutbound('http://staging.metadeals4u.in/go/x'), isFalse);
    expect(api.isTrustedOutbound('https://evil.example/go/x'), isFalse);
    expect(api.isTrustedOutbound('https://staging.metadeals4u.in/admin'), isFalse);
    expect(api.isTrustedOutbound('javascript:alert(1)'), isFalse);
  });

  test('deals request asks for 15 and passes the cursor', () async {
    Uri? seen;
    final api = Api(base: 'https://staging.metadeals4u.in', client: MockClient((request) async {
      seen = request.url;
      return http.Response(jsonEncode({'data': [], 'nextCursor': null}), 200);
    }));
    final page = await api.deals(q: 'tv', category: 'electronics', cursor: 'abc');
    expect(seen!.queryParameters['limit'], '15');
    expect(seen!.queryParameters['cursor'], 'abc');
    expect(seen!.path, '/api/v1/mobile/deals');
    expect(page.deals, isEmpty);
  });

  test('server errors become a friendly message', () async {
    final api = Api(base: 'https://staging.metadeals4u.in', client: MockClient((_) async => http.Response('boom', 500)));
    expect(() => api.deals(), throwsA(isA<ApiException>()));
  });

  test('only our own https pages open inside the app, never the admin area', () {
    const host = 'staging.metadeals4u.in';
    expect(allowInApp(Uri.parse('https://staging.metadeals4u.in/community'), host), isTrue);
    expect(allowInApp(Uri.parse('https://staging.metadeals4u.in/account'), host), isTrue);
    expect(allowInApp(Uri.parse('https://staging.metadeals4u.in/admin/login'), host), isFalse);
    expect(allowInApp(Uri.parse('https://staging.metadeals4u.in/api/v1/admin/deals'), host), isFalse);
    expect(allowInApp(Uri.parse('http://staging.metadeals4u.in/community'), host), isFalse);
    expect(allowInApp(Uri.parse('https://evil.example/community'), host), isFalse);
    expect(allowInApp(Uri.parse('https://staging.metadeals4u.in.evil.example/'), host), isFalse);
  });
}
