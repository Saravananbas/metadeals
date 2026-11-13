class Deal {
  Deal({
    required this.id,
    required this.slug,
    required this.title,
    required this.brand,
    required this.category,
    required this.merchantName,
    required this.price,
    required this.mrp,
    required this.discountPercent,
    required this.imageUrl,
    required this.gallery,
    required this.rating,
    required this.reviewCount,
    required this.outboundUrl,
    this.description = '',
    this.merchantLogoUrl,
    this.expiresAt,
  });

  final String id, slug, title, brand, category, merchantName, imageUrl, outboundUrl, description;
  final int price, mrp, discountPercent, reviewCount;
  final double? rating;
  final List<String> gallery;
  final String? merchantLogoUrl;
  final DateTime? expiresAt;

  int get savings => mrp > price ? mrp - price : 0;

  static int _int(Object? v) => v is num ? v.round() : int.tryParse('$v') ?? 0;

  factory Deal.fromJson(Map<String, dynamic> j) {
    final merchant = (j['merchant'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Deal(
      id: '${j['id']}',
      slug: '${j['slug'] ?? j['id']}',
      title: '${j['title'] ?? ''}',
      brand: '${j['brand'] ?? ''}',
      category: '${j['category'] ?? ''}',
      merchantName: '${merchant['name'] ?? ''}',
      merchantLogoUrl: merchant['logoUrl'] as String?,
      price: _int(j['price']),
      mrp: _int(j['mrp']),
      discountPercent: _int(j['discountPercent']),
      imageUrl: '${j['imageUrl'] ?? ''}',
      gallery: ((j['imageGallery'] as List?) ?? const []).map((e) => '$e').toList(),
      rating: (j['rating'] as num?)?.toDouble(),
      reviewCount: _int(j['reviewCount']),
      outboundUrl: '${j['outboundUrl'] ?? ''}',
      description: '${j['description'] ?? ''}',
      expiresAt: j['expiresAt'] == null ? null : DateTime.tryParse('${j['expiresAt']}'),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'slug': slug,
        'title': title,
        'brand': brand,
        'category': category,
        'merchant': {'name': merchantName, 'logoUrl': merchantLogoUrl},
        'price': price,
        'mrp': mrp,
        'discountPercent': discountPercent,
        'imageUrl': imageUrl,
        'imageGallery': gallery,
        'rating': rating,
        'reviewCount': reviewCount,
        'outboundUrl': outboundUrl,
        'description': description,
        'expiresAt': expiresAt?.toIso8601String(),
      };
}

class Category {
  Category({required this.slug, required this.name, required this.parentId, required this.id, required this.count});
  final String slug, name, id;
  final String? parentId;
  final int count;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: '${j['id']}',
        slug: '${j['slug']}',
        name: '${j['name']}',
        parentId: j['parentId'] as String?,
        count: (j['activeDealsCount'] as num?)?.toInt() ?? 0,
      );
}

class DealPage {
  DealPage(this.deals, this.nextCursor);
  final List<Deal> deals;
  final String? nextCursor;
}
