# MetaDeals4U — Mobile API & iOS (Xcode / Swift) Integration Guide

This guide provides the complete REST API contracts, portable design tokens, and ready-to-use Swift data models for developing the native **MetaDeals4U iOS application in Xcode**.

---

## 1. Mobile API Endpoints Overview

**Base URL:** `https://metadeals4u.in` (or local development: `http://localhost:4123`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/mobile/deals` | Cursor-paginated deal feed with search & filtering |
| `GET` | `/api/v1/mobile/deals/:slug` | Full deal details, multi-store purchase options, and ratings |
| `GET` | `/api/v1/mobile/categories` | Category taxonomy with active deal counts |
| `GET` | `/api/v1/mobile/merchants` | Retailers/merchants with active deal counts |
| `GET` | `/api/v1/mobile/config` | Mobile app remote configuration & feature flags |
| `GET` | `/go/:slug?c=ios` | Attributed outbound affiliate redirect route |

---

## 2. API Contracts & Parameters

### `GET /api/v1/mobile/deals`
**Query Parameters:**
- `q`: Search keyword (e.g. `iphone`, `headphones`)
- `category`: Category slug (e.g. `mobiles`, `electronics`)
- `merchant`: Merchant slug (e.g. `amazon`, `flipkart`)
- `view`: `top` (default) | `latest` | `trending`
- `limit`: Number of items per page (1–50, default 20)
- `cursor`: Pagination cursor returned from previous response

**Response:**
```json
{
  "source": "database",
  "data": [
    {
      "id": "cmw0...",
      "slug": "sony-wh-1000xm5-headphones",
      "title": "Sony WH-1000XM5 Wireless Headphones",
      "brand": "Sony",
      "category": "Audio",
      "merchant": { "slug": "amazon", "name": "Amazon India" },
      "price": 24990,
      "mrp": 34990,
      "discountPercent": 29,
      "savings": 10000,
      "imageUrl": "https://metadeals4u.in/images/products/headphones.png",
      "rating": 4.6,
      "reviewCount": 1820,
      "ratingSource": "Amazon Customer Reviews",
      "outboundUrl": "https://metadeals4u.in/go/sony-wh-1000xm5-headphones?c=ios",
      "expiresAt": null
    }
  ],
  "nextCursor": "cmw0..."
}
```

---

## 3. Swift Models for Xcode (Copy-Paste Ready)

Create a file named `MetaDealsModels.swift` in your Xcode project:

```swift
import Foundation

// MARK: - API Response Wrapper
public struct MobileDealsResponse: Codable {
    public let source: String
    public let data: [MobileDeal]
    public let nextCursor: String?
}

// MARK: - Deal Item (Feed)
public struct MobileDeal: Codable, Identifiable {
    public let id: String
    public let slug: String
    public let title: String
    public let brand: String
    public let category: String
    public let merchant: MobileMerchantSummary
    public let price: Int
    public let mrp: Int
    public let discountPercent: Int
    public let savings: Int?
    public let imageUrl: String
    public let rating: Double?
    public let reviewCount: Int?
    public let ratingSource: String?
    public let outboundUrl: String
    public let expiresAt: String?

    public var formattedPrice: String {
        return "₹\(price.formatted())"
    }

    public var formattedMRP: String {
        return "₹\(mrp.formatted())"
    }
}

public struct MobileMerchantSummary: Codable {
    public let slug: String
    public let name: String
}

// MARK: - Deal Detail
public struct MobileDealDetailResponse: Codable {
    public let data: MobileDealDetail
}

public struct MobileDealDetail: Codable, Identifiable {
    public let id: String
    public let slug: String
    public let title: String
    public let brand: String
    public let description: String?
    public let category: String
    public let merchant: MobileMerchantFull
    public let price: Int
    public let mrp: Int
    public let discountPercent: Int
    public let savings: Int
    public let imageUrl: String
    public let rating: Double?
    public let reviewCount: Int?
    public let ratingSource: String?
    public let outboundUrl: String
    public let publishedAt: String?
    public let expiresAt: String?
    public let options: [MobilePurchaseOption]
}

public struct MobileMerchantFull: Codable {
    public let id: String
    public let name: String
    public let slug: String
    public let websiteUrl: String
}

public struct MobilePurchaseOption: Codable, Identifiable {
    public let id: String
    public let merchantName: String
    public let price: Int
    public let savings: Int
    public let outboundUrl: String

    public var formattedPrice: String {
        return "₹\(price.formatted())"
    }
}

// MARK: - Remote Configuration
public struct MobileConfigResponse: Codable {
    public let data: MobileConfig
}

public struct MobileConfig: Codable {
    public let appName: String
    public let minAppVersion: String
    public let latestAppVersion: String
    public let maintenance: Bool
    public let deepLinkBaseUrl: String
    public let supportEmail: String
    public let features: MobileFeatures
}

public struct MobileFeatures: Codable {
    public let wishlistSync: Bool
    public let socialShare: Bool
    public let pushNotifications: Bool
    public let customerAccounts: Bool
}
```

---

## 4. Swift Network Client for Xcode

Create `MetaDealsAPIClient.swift`:

```swift
import Foundation

public final class MetaDealsAPIClient {
    public static let shared = MetaDealsAPIClient()
    private let baseURL = URL(string: "https://metadeals4u.in")! // Or http://localhost:4123 for simulator testing

    private init() {}

    public func fetchDeals(
        query: String = "",
        category: String = "",
        store: String = "",
        view: String = "top",
        cursor: String? = nil
    ) async throws -> MobileDealsResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/v1/mobile/deals"), resolvingAgainstBaseURL: true)!
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "view", value: view),
            URLQueryItem(name: "limit", value: "20")
        ]
        if !query.isEmpty { queryItems.append(URLQueryItem(name: "q", value: query)) }
        if !category.isEmpty { queryItems.append(URLQueryItem(name: "category", value: category)) }
        if !store.isEmpty { queryItems.append(URLQueryItem(name: "store", value: store)) }
        if let cursor = cursor { queryItems.append(URLQueryItem(name: "cursor", value: cursor)) }

        components.queryItems = queryItems
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(MobileDealsResponse.self, from: data)
    }

    public func fetchDealDetail(slug: String) async throws -> MobileDealDetail {
        let url = baseURL.appendingPathComponent("/api/v1/mobile/deals/\(slug)")
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(MobileDealDetailResponse.self, from: data)
        return decoded.data
    }
}
```

---

## 5. Universal Links Setup (iOS Xcode)

To handle links like `https://metadeals4u.in/deal/sony-wh-1000xm5` natively in iOS:
1. In Xcode, enable **Associated Domains** in your App Target Capabilities.
2. Add the domain entry: `applinks:metadeals4u.in`.
3. In your `App.swift` or `SceneDelegate`:
```swift
.onOpenURL { url in
    if url.pathComponents.contains("deal"), let slug = url.pathComponents.last {
        // Navigate directly to DealDetailView(slug: slug)
    }
}
```
