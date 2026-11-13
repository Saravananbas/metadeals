import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'models.dart';

const brandPurple = Color(0xFF5B21D6);
const brandOrange = Color(0xFFE85D04);

String rupees(int value) {
  final s = value.toString();
  if (s.length <= 3) return '₹$s';
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '₹${parts.join(',')},$last3';
}

Future<void> openBuyNow(BuildContext context, Api api, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  if (!api.isTrustedOutbound(url) || !await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
    messenger.showSnackBar(const SnackBar(content: Text('Could not open the store link.')));
  }
}

class DealImage extends StatelessWidget {
  const DealImage(this.url, {super.key, this.fit = BoxFit.contain});
  final String url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) => url.isEmpty
      ? const Icon(Icons.image_outlined, size: 40, color: Colors.black26)
      : CachedNetworkImage(
          imageUrl: url,
          fit: fit,
          placeholder: (_, _) => const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
          errorWidget: (_, _, _) => const Icon(Icons.image_not_supported_outlined, size: 36, color: Colors.black26),
        );
}

class DealCard extends StatelessWidget {
  const DealCard({super.key, required this.deal, required this.saved, required this.onSave, required this.onOpen, required this.api});
  final Deal deal;
  final bool saved;
  final VoidCallback onSave, onOpen;
  final Api api;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Stack(children: [
                Container(
                  width: 118,
                  height: 130,
                  decoration: BoxDecoration(color: const Color(0xFFF3F0FF), borderRadius: BorderRadius.circular(14)),
                  padding: const EdgeInsets.all(6),
                  child: DealImage(deal.imageUrl),
                ),
                if (deal.discountPercent > 0)
                  Positioned(
                    left: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(color: const Color(0xFFC21818), borderRadius: BorderRadius.circular(8)),
                      child: Text('${deal.discountPercent}% OFF', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                  ),
              ]),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Text(deal.title, maxLines: 3, overflow: TextOverflow.ellipsis, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: saved ? 'Remove from saved' : 'Save deal',
                      onPressed: onSave,
                      icon: Icon(saved ? Icons.favorite : Icons.favorite_border, color: saved ? Colors.red : null),
                    ),
                  ]),
                  if (deal.rating != null && deal.rating! > 0)
                    Row(children: [
                      ...List.generate(5, (i) => Icon(i < deal.rating!.floor() ? Icons.star : Icons.star_border, size: 14, color: Colors.amber[700])),
                      const SizedBox(width: 4),
                      Text(deal.rating!.toStringAsFixed(1), style: text.bodySmall),
                    ]),
                  const SizedBox(height: 4),
                  Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                    Text(rupees(deal.price), style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF2E1065))),
                    const SizedBox(width: 6),
                    if (deal.mrp > deal.price) Text(rupees(deal.mrp), style: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.black45, fontSize: 13)),
                  ]),
                  if (deal.savings > 0)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(20)),
                      child: Text('Save ${rupees(deal.savings)}', style: const TextStyle(color: Color(0xFF166534), fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  const SizedBox(height: 4),
                  Text(deal.merchantName, style: text.bodySmall?.copyWith(color: Colors.black54)),
                ]),
              ),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46), foregroundColor: brandPurple, side: const BorderSide(color: brandPurple), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  onPressed: onOpen,
                  child: const Text('Post Details', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), backgroundColor: brandOrange, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  onPressed: () => openBuyNow(context, api, deal.outboundUrl),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('Buy Now', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}
