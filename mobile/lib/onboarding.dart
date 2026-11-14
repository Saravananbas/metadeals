import 'package:flutter/material.dart';
import 'brand.dart';
import 'widgets.dart';

const _slides = [
  (Icons.local_offer, 'Verified deals, every day', 'Browse the best prices from Amazon, Flipkart and more, with the real discount shown.'),
  (Icons.forum, 'Ask and share in the Forum', 'Join the community: discuss deals, share tips and warn others about bad offers.'),
  (Icons.add_circle, 'Found a deal? Post it', 'Submit a deal in a minute and help everyone save money.'),
];

/// Three first-run slides with Next and Skip.
class Onboarding extends StatefulWidget {
  const Onboarding({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<Onboarding> createState() => _OnboardingState();
}

class _OnboardingState extends State<Onboarding> {
  final _page = PageController();
  int _i = 0;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final last = _i == _slides.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: widget.onDone, child: const Text('Skip'))),
          const BrandLogo(size: 44),
          Expanded(
            child: PageView(controller: _page, onPageChanged: (i) => setState(() => _i = i), children: [
              for (final s in _slides)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    CircleAvatar(radius: 56, backgroundColor: const Color(0xFFEDE9FE), child: Icon(s.$1, size: 56, color: brandPurple)),
                    const SizedBox(height: 28),
                    Text(s.$2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 12),
                    Text(s.$3, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, color: Colors.black54)),
                  ]),
                ),
            ]),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < _slides.length; i++)
              Container(margin: const EdgeInsets.all(4), width: i == _i ? 22 : 8, height: 8, decoration: BoxDecoration(color: i == _i ? brandPurple : Colors.black26, borderRadius: BorderRadius.circular(4))),
          ]),
          Padding(
            padding: const EdgeInsets.all(20),
            child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: brandPurple),
              onPressed: () => last ? widget.onDone() : _page.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
              child: Text(last ? 'Get started' : 'Next', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          ),
        ]),
      ),
    );
  }
}
