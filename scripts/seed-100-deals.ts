import "dotenv/config";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";

interface SeedItem {
  title: string;
  brand: string;
  categorySlug: string;
  merchantSlug: string;
  mrp: number; // in INR rupees
  price: number; // in INR rupees
  rating: number;
  reviewCount: number;
  imageKey: "phone" | "laptop" | "headphones" | "air-fryer" | "shoes" | "watch";
  featured?: boolean;
  trending?: boolean;
}

const seedItems: SeedItem[] = [
  // --- Category: Mobiles (10 deals) ---
  {
    title: "Apple iPhone 15 Pro Max (256 GB) - Natural Titanium",
    brand: "Apple",
    categorySlug: "mobiles",
    merchantSlug: "amazon",
    mrp: 159900,
    price: 139999,
    rating: 4.8,
    reviewCount: 14200,
    imageKey: "phone",
    featured: true,
    trending: true,
  },
  {
    title: "Samsung Galaxy S24 Ultra 5G (Titanium Gray, 512 GB, 12 GB RAM)",
    brand: "Samsung",
    categorySlug: "mobiles",
    merchantSlug: "amazon",
    mrp: 144999,
    price: 119999,
    rating: 4.7,
    reviewCount: 9850,
    imageKey: "phone",
    featured: true,
    trending: true,
  },
  {
    title: "OnePlus 12 (Silky Black, 16GB RAM, 512GB Storage)",
    brand: "OnePlus",
    categorySlug: "mobiles",
    merchantSlug: "amazon",
    mrp: 69999,
    price: 59999,
    rating: 4.6,
    reviewCount: 7600,
    imageKey: "phone",
  },
  {
    title: "Google Pixel 8 Pro (Bay, 128 GB, 12 GB RAM)",
    brand: "Google",
    categorySlug: "mobiles",
    merchantSlug: "flipkart",
    mrp: 106999,
    price: 74999,
    rating: 4.5,
    reviewCount: 4320,
    imageKey: "phone",
    featured: true,
  },
  {
    title: "Redmi Note 13 Pro+ 5G (Fusion Purple, 12GB RAM, 512GB)",
    brand: "Xiaomi",
    categorySlug: "mobiles",
    merchantSlug: "flipkart",
    mrp: 35999,
    price: 27999,
    rating: 4.4,
    reviewCount: 18500,
    imageKey: "phone",
  },
  {
    title: "Realme 12 Pro+ 5G (Submarine Blue, 8GB RAM, 256GB)",
    brand: "Realme",
    categorySlug: "mobiles",
    merchantSlug: "flipkart",
    mrp: 34999,
    price: 26999,
    rating: 4.3,
    reviewCount: 11200,
    imageKey: "phone",
  },
  {
    title: "Vivo V30 Pro 5G (Andaman Blue, 12GB RAM, 512GB)",
    brand: "Vivo",
    categorySlug: "mobiles",
    merchantSlug: "croma",
    mrp: 46999,
    price: 41999,
    rating: 4.5,
    reviewCount: 5200,
    imageKey: "phone",
  },
  {
    title: "Motorola Edge 50 Pro 5G (Black Beauty, 12GB RAM, 256GB)",
    brand: "Motorola",
    categorySlug: "mobiles",
    merchantSlug: "flipkart",
    mrp: 41999,
    price: 31999,
    rating: 4.4,
    reviewCount: 8400,
    imageKey: "phone",
  },
  {
    title: "Nothing Phone (2) (Dark Grey, 12GB RAM, 256GB)",
    brand: "Nothing",
    categorySlug: "mobiles",
    merchantSlug: "flipkart",
    mrp: 54999,
    price: 36999,
    rating: 4.5,
    reviewCount: 6700,
    imageKey: "phone",
    trending: true,
  },
  {
    title: "iQOO Neo 9 Pro 5G (Fiery Red, 8GB RAM, 256GB)",
    brand: "iQOO",
    categorySlug: "mobiles",
    merchantSlug: "amazon",
    mrp: 39999,
    price: 34999,
    rating: 4.6,
    reviewCount: 12900,
    imageKey: "phone",
  },

  // --- Category: Laptops (10 deals) ---
  {
    title: "Apple MacBook Air M3 Chip (15.3-inch Liquid Retina, 16GB, 512GB)",
    brand: "Apple",
    categorySlug: "laptops",
    merchantSlug: "amazon",
    mrp: 154900,
    price: 134990,
    rating: 4.8,
    reviewCount: 3100,
    imageKey: "laptop",
    featured: true,
    trending: true,
  },
  {
    title: "Dell XPS 13 Plus Intel Core i7 13th Gen (16GB, 1TB SSD, OLED 3.5K)",
    brand: "Dell",
    categorySlug: "laptops",
    merchantSlug: "croma",
    mrp: 189990,
    price: 149990,
    rating: 4.6,
    reviewCount: 1450,
    imageKey: "laptop",
    featured: true,
  },
  {
    title: "Lenovo Legion Pro 5 Gen 8 AMD Ryzen 7 (16GB, 1TB SSD, RTX 4070)",
    brand: "Lenovo",
    categorySlug: "laptops",
    merchantSlug: "flipkart",
    mrp: 184990,
    price: 139990,
    rating: 4.7,
    reviewCount: 2200,
    imageKey: "laptop",
    trending: true,
  },
  {
    title: "ASUS Zenbook 14 OLED Intel Core Ultra 7 (16GB, 1TB SSD, 1.2kg)",
    brand: "ASUS",
    categorySlug: "laptops",
    merchantSlug: "amazon",
    mrp: 122990,
    price: 99990,
    rating: 4.5,
    reviewCount: 1890,
    imageKey: "laptop",
  },
  {
    title: "HP Pavilion Plus 14 OLED AMD Ryzen 7 (16GB, 1TB SSD, 2.8K 120Hz)",
    brand: "HP",
    categorySlug: "laptops",
    merchantSlug: "amazon",
    mrp: 96990,
    price: 76990,
    rating: 4.4,
    reviewCount: 3400,
    imageKey: "laptop",
  },
  {
    title: "Acer Swift Go 14 Intel Core Ultra 5 (16GB, 512GB SSD, OLED WQXGA+)",
    brand: "Acer",
    categorySlug: "laptops",
    merchantSlug: "flipkart",
    mrp: 84999,
    price: 64990,
    rating: 4.3,
    reviewCount: 2100,
    imageKey: "laptop",
  },
  {
    title: "MSI Modern 14 Intel Core i5 12th Gen (16GB, 512GB SSD, Thin & Light)",
    brand: "MSI",
    categorySlug: "laptops",
    merchantSlug: "flipkart",
    mrp: 64990,
    price: 41990,
    rating: 4.2,
    reviewCount: 4500,
    imageKey: "laptop",
  },
  {
    title: "Samsung Galaxy Book4 Intel Core 5 (16GB, 512GB SSD, FHD Display)",
    brand: "Samsung",
    categorySlug: "laptops",
    merchantSlug: "reliancedigital",
    mrp: 89990,
    price: 69990,
    rating: 4.5,
    reviewCount: 1650,
    imageKey: "laptop",
  },
  {
    title: "LG Gram 16 Ultra-Light Intel Evo i7 (16GB, 512GB SSD, 1.19kg)",
    brand: "LG",
    categorySlug: "laptops",
    merchantSlug: "amazon",
    mrp: 152000,
    price: 104990,
    rating: 4.6,
    reviewCount: 980,
    imageKey: "laptop",
  },
  {
    title: "Lenovo IdeaPad Slim 3 12th Gen Intel Core i3 (8GB, 512GB SSD)",
    brand: "Lenovo",
    categorySlug: "laptops",
    merchantSlug: "amazon",
    mrp: 52990,
    price: 33990,
    rating: 4.3,
    reviewCount: 8900,
    imageKey: "laptop",
  },

  // --- Category: Electronics & Audio (10 deals) ---
  {
    title: "Sony WH-1000XM5 Premium Wireless Noise Canceling Headphones",
    brand: "Sony",
    categorySlug: "electronics",
    merchantSlug: "amazon",
    mrp: 34990,
    price: 25990,
    rating: 4.7,
    reviewCount: 16500,
    imageKey: "headphones",
    featured: true,
    trending: true,
  },
  {
    title: "Bose QuietComfort 45 Bluetooth Wireless Noise Cancelling Headphones",
    brand: "Bose",
    categorySlug: "electronics",
    merchantSlug: "croma",
    mrp: 29900,
    price: 19990,
    rating: 4.6,
    reviewCount: 7800,
    imageKey: "headphones",
    featured: true,
  },
  {
    title: "Apple AirPods Pro (2nd Gen) with MagSafe Case (USB-C)",
    brand: "Apple",
    categorySlug: "electronics",
    merchantSlug: "amazon",
    mrp: 24900,
    price: 19999,
    rating: 4.8,
    reviewCount: 28900,
    imageKey: "headphones",
    featured: true,
    trending: true,
  },
  {
    title: "Samsung Galaxy Buds2 Pro True Wireless Earbuds (Graphite)",
    brand: "Samsung",
    categorySlug: "electronics",
    merchantSlug: "flipkart",
    mrp: 19999,
    price: 9999,
    rating: 4.5,
    reviewCount: 11200,
    imageKey: "headphones",
  },
  {
    title: "Marshall Major IV Wireless Bluetooth On-Ear Headphone (80+ Hours)",
    brand: "Marshall",
    categorySlug: "electronics",
    merchantSlug: "cuelinks",
    mrp: 14999,
    price: 9999,
    rating: 4.6,
    reviewCount: 6500,
    imageKey: "headphones",
  },
  {
    title: "Sennheiser Momentum 4 Wireless Audiophile Headphones (60Hr Battery)",
    brand: "Sennheiser",
    categorySlug: "electronics",
    merchantSlug: "amazon",
    mrp: 34990,
    price: 24990,
    rating: 4.7,
    reviewCount: 4200,
    imageKey: "headphones",
  },
  {
    title: "JBL Flip 6 Portable Waterproof Bluetooth Speaker (30W Output)",
    brand: "JBL",
    categorySlug: "electronics",
    merchantSlug: "amazon",
    mrp: 13999,
    price: 8999,
    rating: 4.5,
    reviewCount: 19400,
    imageKey: "headphones",
  },
  {
    title: "Apple Watch Series 9 GPS 45mm Midnight Aluminium Case",
    brand: "Apple",
    categorySlug: "electronics",
    merchantSlug: "amazon",
    mrp: 44900,
    price: 36999,
    rating: 4.8,
    reviewCount: 12500,
    imageKey: "watch",
    featured: true,
    trending: true,
  },
  {
    title: "Garmin Forerunner 265 Running Smartwatch with AMOLED Display",
    brand: "Garmin",
    categorySlug: "electronics",
    merchantSlug: "cuelinks",
    mrp: 50490,
    price: 43990,
    rating: 4.7,
    reviewCount: 2800,
    imageKey: "watch",
  },
  {
    title: "Amazfit GTR 4 Smart Watch with Dual-Band GPS & 14-Day Battery",
    brand: "Amazfit",
    categorySlug: "electronics",
    merchantSlug: "flipkart",
    mrp: 23999,
    price: 14999,
    rating: 4.4,
    reviewCount: 8900,
    imageKey: "watch",
  },

  // --- Category: Appliances (10 deals) ---
  {
    title: "LG 55-inch 4K Ultra HD Smart OLED TV (OLED55C3PSA)",
    brand: "LG",
    categorySlug: "appliances",
    merchantSlug: "croma",
    mrp: 189990,
    price: 114990,
    rating: 4.8,
    reviewCount: 5400,
    imageKey: "air-fryer",
    featured: true,
    trending: true,
  },
  {
    title: "Samsung 65-inch The Frame Series 4K QLED Smart TV",
    brand: "Samsung",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 149900,
    price: 99990,
    rating: 4.7,
    reviewCount: 3800,
    imageKey: "air-fryer",
    featured: true,
  },
  {
    title: "Sony Bravia 43-inch 4K Ultra HD Smart LED Google TV",
    brand: "Sony",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 59990,
    price: 39990,
    rating: 4.6,
    reviewCount: 15400,
    imageKey: "air-fryer",
  },
  {
    title: "Philips Digital Air Fryer HD9252/90 (4.1 Liter, Rapid Air)",
    brand: "Philips",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 11995,
    price: 6499,
    rating: 4.6,
    reviewCount: 22100,
    imageKey: "air-fryer",
    trending: true,
  },
  {
    title: "Dyson V12 Detect Slim Extra Cordless Vacuum Cleaner",
    brand: "Dyson",
    categorySlug: "appliances",
    merchantSlug: "cuelinks",
    mrp: 65900,
    price: 47900,
    rating: 4.7,
    reviewCount: 3900,
    imageKey: "air-fryer",
    featured: true,
  },
  {
    title: "IFB 8 Kg 5 Star AI Powered Front Load Washing Machine",
    brand: "IFB",
    categorySlug: "appliances",
    merchantSlug: "flipkart",
    mrp: 47990,
    price: 34990,
    rating: 4.4,
    reviewCount: 7800,
    imageKey: "air-fryer",
  },
  {
    title: "Bosch 13 Place Settings Free-Standing Dishwasher (SMS66GI01I)",
    brand: "Bosch",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 54990,
    price: 41990,
    rating: 4.5,
    reviewCount: 4600,
    imageKey: "air-fryer",
  },
  {
    title: "Panasonic 27L Convection Microwave Oven with 360° Heat Wrap",
    brand: "Panasonic",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 16990,
    price: 11490,
    rating: 4.4,
    reviewCount: 8900,
    imageKey: "air-fryer",
  },
  {
    title: "Kent Grand Plus RO + UV + UF Mineral Water Purifier (9L)",
    brand: "Kent",
    categorySlug: "appliances",
    merchantSlug: "flipkart",
    mrp: 21000,
    price: 13999,
    rating: 4.3,
    reviewCount: 16700,
    imageKey: "air-fryer",
  },
  {
    title: "Havells Stealth Air 1200mm BLDC Ceiling Fan with Remote",
    brand: "Havells",
    categorySlug: "appliances",
    merchantSlug: "amazon",
    mrp: 7990,
    price: 4999,
    rating: 4.4,
    reviewCount: 9400,
    imageKey: "air-fryer",
  },

  // --- Category: Home & Kitchen (10 deals) ---
  {
    title: "Prestige Iris 750 Watt Mixer Grinder with 4 Jars (Stainless Steel)",
    brand: "Prestige",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 6295,
    price: 3199,
    rating: 4.3,
    reviewCount: 38900,
    imageKey: "air-fryer",
    trending: true,
  },
  {
    title: "Pigeon by Stovekraft Cruise 1800W Induction Cooktop with 7 Menus",
    brand: "Pigeon",
    categorySlug: "home",
    merchantSlug: "flipkart",
    mrp: 3195,
    price: 1499,
    rating: 4.2,
    reviewCount: 24500,
    imageKey: "air-fryer",
  },
  {
    title: "Milton Thermosteel Flip Lid Vacuum Insulated Flask (1000ml)",
    brand: "Milton",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 1290,
    price: 849,
    rating: 4.5,
    reviewCount: 42100,
    imageKey: "air-fryer",
  },
  {
    title: "Wonderchef Royal Velvet Non-Stick Cookware Set (Induction Safe, 4-Piece)",
    brand: "Wonderchef",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 4500,
    price: 2499,
    rating: 4.3,
    reviewCount: 12800,
    imageKey: "air-fryer",
  },
  {
    title: "Wipro Next 20W Smart LED Batten with 16 Million Colours (Alexa/Google)",
    brand: "Wipro",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 2490,
    price: 1199,
    rating: 4.4,
    reviewCount: 15400,
    imageKey: "air-fryer",
  },
  {
    title: "Sleepwell Ortho Pro Spring Pocket Mattress (Queen Size 78x60x6)",
    brand: "Sleepwell",
    categorySlug: "home",
    merchantSlug: "flipkart",
    mrp: 24999,
    price: 16999,
    rating: 4.5,
    reviewCount: 4200,
    imageKey: "air-fryer",
  },
  {
    title: "Philips Handheld Garment Steamer 1000W (STH3000/20, Compact Foldable)",
    brand: "Philips",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 4195,
    price: 2699,
    rating: 4.3,
    reviewCount: 18700,
    imageKey: "air-fryer",
  },
  {
    title: "Eureka Forbes Quick Clean DX 1200W Dry Vacuum Cleaner with 3 Dust Bags",
    brand: "Eureka Forbes",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 5999,
    price: 3499,
    rating: 4.2,
    reviewCount: 31200,
    imageKey: "air-fryer",
  },
  {
    title: "Bajaj DX-7 1000W Dry Iron with Super Clean Surface Finish",
    brand: "Bajaj",
    categorySlug: "home",
    merchantSlug: "flipkart",
    mrp: 1495,
    price: 899,
    rating: 4.4,
    reviewCount: 56000,
    imageKey: "air-fryer",
  },
  {
    title: "Hawkins Contura Hard Anodised Aluminium Pressure Cooker (3 Litre)",
    brand: "Hawkins",
    categorySlug: "home",
    merchantSlug: "amazon",
    mrp: 2350,
    price: 1799,
    rating: 4.6,
    reviewCount: 48900,
    imageKey: "air-fryer",
  },

  // --- Category: Men's Fashion (10 deals) ---
  {
    title: "Nike Air Max 270 Men's Running Shoes (Triple Black)",
    brand: "Nike",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 13995,
    price: 9795,
    rating: 4.6,
    reviewCount: 8900,
    imageKey: "shoes",
    featured: true,
    trending: true,
  },
  {
    title: "Levi's Men's 511 Slim Fit Stretch Denim Jeans (Dark Indigo)",
    brand: "Levi's",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 4299,
    price: 2149,
    rating: 4.4,
    reviewCount: 14500,
    imageKey: "shoes",
  },
  {
    title: "Adidas Ultraboost Light Men's High Performance Running Shoes",
    brand: "Adidas",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 18999,
    price: 11399,
    rating: 4.7,
    reviewCount: 6200,
    imageKey: "shoes",
    featured: true,
  },
  {
    title: "Puma Tazon 6 Fracture Cross-Training Shoes for Men",
    brand: "Puma",
    categorySlug: "men",
    merchantSlug: "amazon",
    mrp: 5999,
    price: 2799,
    rating: 4.3,
    reviewCount: 9400,
    imageKey: "shoes",
  },
  {
    title: "Tommy Hilfiger Men's Pure Cotton Slim Fit Polo T-Shirt",
    brand: "Tommy Hilfiger",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 3999,
    price: 2399,
    rating: 4.4,
    reviewCount: 5100,
    imageKey: "shoes",
  },
  {
    title: "Fossil Grant Chronograph Leather Watch for Men (FS4813)",
    brand: "Fossil",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 12995,
    price: 7795,
    rating: 4.5,
    reviewCount: 8300,
    imageKey: "watch",
  },
  {
    title: "Woodland Men's Camel Outdoor Leather Casual Boots",
    brand: "Woodland",
    categorySlug: "men",
    merchantSlug: "flipkart",
    mrp: 5495,
    price: 3295,
    rating: 4.4,
    reviewCount: 17200,
    imageKey: "shoes",
  },
  {
    title: "Ray-Ban Classic Polarized Aviator Sunglasses (Gold Green)",
    brand: "Ray-Ban",
    categorySlug: "men",
    merchantSlug: "amazon",
    mrp: 9590,
    price: 6890,
    rating: 4.6,
    reviewCount: 4900,
    imageKey: "shoes",
  },
  {
    title: "Allen Solly Men's Slim Fit Casual Chino Trousers (Khaki)",
    brand: "Allen Solly",
    categorySlug: "men",
    merchantSlug: "myntra",
    mrp: 2499,
    price: 1399,
    rating: 4.3,
    reviewCount: 12400,
    imageKey: "shoes",
  },
  {
    title: "Wildcraft Trail Rucksack 45L Adventure Travel Bag",
    brand: "Wildcraft",
    categorySlug: "men",
    merchantSlug: "amazon",
    mrp: 3999,
    price: 2199,
    rating: 4.4,
    reviewCount: 8900,
    imageKey: "shoes",
  },

  // --- Category: Women's Fashion (10 deals) ---
  {
    title: "Michael Kors Jet Set Large Saffiano Leather Tote Bag",
    brand: "Michael Kors",
    categorySlug: "women",
    merchantSlug: "cuelinks",
    mrp: 32000,
    price: 19999,
    rating: 4.8,
    reviewCount: 2300,
    imageKey: "shoes",
    featured: true,
  },
  {
    title: "Swarovski Attract Trilogy Round Crystal Pendant Necklace",
    brand: "Swarovski",
    categorySlug: "women",
    merchantSlug: "cuelinks",
    mrp: 9990,
    price: 6990,
    rating: 4.7,
    reviewCount: 3400,
    imageKey: "watch",
    featured: true,
  },
  {
    title: "Biba Women's Pure Cotton Printed Anarkali Kurta with Dupatta",
    brand: "Biba",
    categorySlug: "women",
    merchantSlug: "myntra",
    mrp: 5999,
    price: 2999,
    rating: 4.4,
    reviewCount: 11200,
    imageKey: "shoes",
  },
  {
    title: "H&M Women's Ribbed Knit Midi Dress (Black Elegance)",
    brand: "H&M",
    categorySlug: "women",
    merchantSlug: "myntra",
    mrp: 2999,
    price: 1799,
    rating: 4.3,
    reviewCount: 6700,
    imageKey: "shoes",
  },
  {
    title: "Aldo Stiletto High Heel Pumps for Women (Nude Gloss)",
    brand: "Aldo",
    categorySlug: "women",
    merchantSlug: "myntra",
    mrp: 8999,
    price: 5399,
    rating: 4.5,
    reviewCount: 1800,
    imageKey: "shoes",
  },
  {
    title: "Titan Raga Viva Analog Mother of Pearl Dial Women's Watch",
    brand: "Titan",
    categorySlug: "women",
    merchantSlug: "amazon",
    mrp: 6495,
    price: 4545,
    rating: 4.6,
    reviewCount: 9800,
    imageKey: "watch",
  },
  {
    title: "Lavie Women's Betula Flap Structured Faux Leather Satchel",
    brand: "Lavie",
    categorySlug: "women",
    merchantSlug: "flipkart",
    mrp: 4499,
    price: 1799,
    rating: 4.3,
    reviewCount: 14200,
    imageKey: "shoes",
  },
  {
    title: "Vero Moda Women's Classic Regular Fit Denim Jacket",
    brand: "Vero Moda",
    categorySlug: "women",
    merchantSlug: "myntra",
    mrp: 3999,
    price: 2199,
    rating: 4.4,
    reviewCount: 4600,
    imageKey: "shoes",
  },
  {
    title: "Fastrack Polarized Round Gradient Sunglasses for Women",
    brand: "Fastrack",
    categorySlug: "women",
    merchantSlug: "amazon",
    mrp: 2299,
    price: 1379,
    rating: 4.3,
    reviewCount: 7800,
    imageKey: "shoes",
  },
  {
    title: "Caprese Women's Textured Solid Envelope Clutch with Chain",
    brand: "Caprese",
    categorySlug: "women",
    merchantSlug: "myntra",
    mrp: 2899,
    price: 1299,
    rating: 4.2,
    reviewCount: 5400,
    imageKey: "shoes",
  },

  // --- Category: Beauty & Personal Care (10 deals) ---
  {
    title: "Philips AquaTouch S1030/04 Wet & Dry Cordless Shaver",
    brand: "Philips",
    categorySlug: "beauty",
    merchantSlug: "amazon",
    mrp: 2995,
    price: 1799,
    rating: 4.5,
    reviewCount: 31000,
    imageKey: "air-fryer",
  },
  {
    title: "Dyson Supersonic Hair Dryer (Iron/Fuchsia) with Intelligent Heat Control",
    brand: "Dyson",
    categorySlug: "beauty",
    merchantSlug: "croma",
    mrp: 39900,
    price: 32900,
    rating: 4.8,
    reviewCount: 4100,
    imageKey: "air-fryer",
    featured: true,
  },
  {
    title: "Oral-B Pro 1000 CrossAction Electric Rechargeable Toothbrush",
    brand: "Oral-B",
    categorySlug: "beauty",
    merchantSlug: "amazon",
    mrp: 3999,
    price: 2499,
    rating: 4.6,
    reviewCount: 18500,
    imageKey: "air-fryer",
  },
  {
    title: "Braun Silk-épil 9 9-720 Wet & Dry Epilator with 4 Extras",
    brand: "Braun",
    categorySlug: "beauty",
    merchantSlug: "amazon",
    mrp: 9999,
    price: 6499,
    rating: 4.5,
    reviewCount: 8900,
    imageKey: "air-fryer",
  },
  {
    title: "Wahl Professional Cordless Magic Clip Precision Clipper",
    brand: "Wahl",
    categorySlug: "beauty",
    merchantSlug: "cuelinks",
    mrp: 9500,
    price: 7299,
    rating: 4.6,
    reviewCount: 3200,
    imageKey: "air-fryer",
  },
  {
    title: "Forest Essentials Soundarya Radiance Cream with 24K Gold & SPF 25",
    brand: "Forest Essentials",
    categorySlug: "beauty",
    merchantSlug: "myntra",
    mrp: 5400,
    price: 4320,
    rating: 4.7,
    reviewCount: 5200,
    imageKey: "air-fryer",
  },
  {
    title: "Beardo Godfather Beard Growth Oil & Wash Grooming Combo",
    brand: "Beardo",
    categorySlug: "beauty",
    merchantSlug: "flipkart",
    mrp: 950,
    price: 499,
    rating: 4.3,
    reviewCount: 29000,
    imageKey: "air-fryer",
  },
  {
    title: "Kama Ayurveda Pure Rosewater Natural Hydrating Facial Mist (200ml)",
    brand: "Kama Ayurveda",
    categorySlug: "beauty",
    merchantSlug: "myntra",
    mrp: 1495,
    price: 1195,
    rating: 4.6,
    reviewCount: 8400,
    imageKey: "air-fryer",
  },
  {
    title: "The Ordinary Niacinamide 10% + Zinc 1% Blemish & Pore Serum (60ml)",
    brand: "The Ordinary",
    categorySlug: "beauty",
    merchantSlug: "myntra",
    mrp: 1200,
    price: 899,
    rating: 4.6,
    reviewCount: 45000,
    imageKey: "air-fryer",
    trending: true,
  },
  {
    title: "Cetaphil Gentle Skin Cleanser for Dry to Normal Sensitive Skin (500ml)",
    brand: "Cetaphil",
    categorySlug: "beauty",
    merchantSlug: "amazon",
    mrp: 1399,
    price: 979,
    rating: 4.7,
    reviewCount: 58000,
    imageKey: "air-fryer",
  },

  // --- Category: Sports & Fitness (10 deals) ---
  {
    title: "Decathlon Domyos Rubber Hex Dumbbell Set 20kg (Pair with Rack)",
    brand: "Decathlon",
    categorySlug: "sports",
    merchantSlug: "cuelinks",
    mrp: 6999,
    price: 4499,
    rating: 4.7,
    reviewCount: 8900,
    imageKey: "shoes",
  },
  {
    title: "Yonex Astrox 88D Pro Badminton Racket (Made in Japan)",
    brand: "Yonex",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 18990,
    price: 13990,
    rating: 4.8,
    reviewCount: 3200,
    imageKey: "shoes",
    featured: true,
  },
  {
    title: "Nivia Storm Football Size 5 with High Grip Outer Texture",
    brand: "Nivia",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 999,
    price: 499,
    rating: 4.3,
    reviewCount: 34000,
    imageKey: "shoes",
  },
  {
    title: "SG Hilite English Willow Cricket Bat Full Size (Grade 1)",
    brand: "SG",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 14999,
    price: 10499,
    rating: 4.6,
    reviewCount: 2900,
    imageKey: "shoes",
  },
  {
    title: "Strauss Anti-Skid Pro 6mm Dual Color TPE Yoga & Exercise Mat",
    brand: "Strauss",
    categorySlug: "sports",
    merchantSlug: "flipkart",
    mrp: 2499,
    price: 1099,
    rating: 4.4,
    reviewCount: 21500,
    imageKey: "shoes",
  },
  {
    title: "Boldfit Heavy Duty Resistance Bands Set of 5 with Handles & Door Anchor",
    brand: "Boldfit",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 2499,
    price: 1199,
    rating: 4.4,
    reviewCount: 16700,
    imageKey: "shoes",
  },
  {
    title: "Fast&Up 100% Plant Protein Isolate Powder (Rich Chocolate, 1kg)",
    brand: "Fast&Up",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 2799,
    price: 1899,
    rating: 4.3,
    reviewCount: 14800,
    imageKey: "shoes",
  },
  {
    title: "Lifelong FitPro 2.5 HP Peak Motorized Folding Treadmill with 12 Presets",
    brand: "Lifelong",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 39999,
    price: 17999,
    rating: 4.2,
    reviewCount: 8200,
    imageKey: "shoes",
    trending: true,
  },
  {
    title: "Cult.fit Smart Bluetooth Jump Rope with App Counter & Weighted Ropes",
    brand: "Cult.fit",
    categorySlug: "sports",
    merchantSlug: "flipkart",
    mrp: 2499,
    price: 1199,
    rating: 4.5,
    reviewCount: 4600,
    imageKey: "shoes",
  },
  {
    title: "Speedo Biofuse 2.0 Anti-Fog UV Protection Swimming Goggles",
    brand: "Speedo",
    categorySlug: "sports",
    merchantSlug: "amazon",
    mrp: 2299,
    price: 1499,
    rating: 4.6,
    reviewCount: 6800,
    imageKey: "shoes",
  },

  // --- Category: Travel & Luggage (10 deals) ---
  {
    title: "American Tourister Ivy 3-Piece Polypropylene Spinner Luggage Set",
    brand: "American Tourister",
    categorySlug: "travel",
    merchantSlug: "amazon",
    mrp: 22999,
    price: 10499,
    rating: 4.6,
    reviewCount: 18200,
    imageKey: "shoes",
    featured: true,
    trending: true,
  },
  {
    title: "Samsonite Stryde 2 Polycarbonate Hardside Luggage (Large 75cm)",
    brand: "Samsonite",
    categorySlug: "travel",
    merchantSlug: "cuelinks",
    mrp: 28500,
    price: 18990,
    rating: 4.8,
    reviewCount: 3900,
    imageKey: "shoes",
    featured: true,
  },
  {
    title: "Skybags Weekender Large Polyester Duffel Trolley Bag (65cm)",
    brand: "Skybags",
    categorySlug: "travel",
    merchantSlug: "flipkart",
    mrp: 5499,
    price: 2499,
    rating: 4.3,
    reviewCount: 22100,
    imageKey: "shoes",
  },
  {
    title: "Safari Thorium 8 Wheels Polycarbonate Check-in Trolley (65cm, Teal)",
    brand: "Safari",
    categorySlug: "travel",
    merchantSlug: "amazon",
    mrp: 10499,
    price: 3699,
    rating: 4.4,
    reviewCount: 16400,
    imageKey: "shoes",
    trending: true,
  },
  {
    title: "Travelpro Maxlite 5 Expandable Lightweight Carry-On Roller",
    brand: "Travelpro",
    categorySlug: "travel",
    merchantSlug: "amazon",
    mrp: 18999,
    price: 12999,
    rating: 4.7,
    reviewCount: 2400,
    imageKey: "shoes",
  },
  {
    title: "Mokobara The Transit Backpack with 15.6 Laptop Sleeve & USB Port",
    brand: "Mokobara",
    categorySlug: "travel",
    merchantSlug: "cuelinks",
    mrp: 6999,
    price: 4499,
    rating: 4.7,
    reviewCount: 5600,
    imageKey: "shoes",
    featured: true,
  },
  {
    title: "Swiss Military Hardcase Polycarbonate Cabin Trolley Bag (55cm)",
    brand: "Swiss Military",
    categorySlug: "travel",
    merchantSlug: "flipkart",
    mrp: 8990,
    price: 3999,
    rating: 4.3,
    reviewCount: 7800,
    imageKey: "shoes",
  },
  {
    title: "Urban Tribe Dual Tone Expandable Travel Rucksack 45L",
    brand: "Urban Tribe",
    categorySlug: "travel",
    merchantSlug: "amazon",
    mrp: 4499,
    price: 2199,
    rating: 4.4,
    reviewCount: 6200,
    imageKey: "shoes",
  },
  {
    title: "Aristocrat Polycarbonate Hard-Sided 4 Wheel Trolley (55cm Red)",
    brand: "Aristocrat",
    categorySlug: "travel",
    merchantSlug: "flipkart",
    mrp: 5990,
    price: 1899,
    rating: 4.2,
    reviewCount: 19800,
    imageKey: "shoes",
  },
  {
    title: "Skybags Casual Unisex Daypack with Bottle Holder & Rain Cover (30L)",
    brand: "Skybags",
    categorySlug: "travel",
    merchantSlug: "amazon",
    mrp: 2499,
    price: 1099,
    rating: 4.3,
    reviewCount: 26400,
    imageKey: "shoes",
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

async function prepareMediaAssets(db: ReturnType<typeof getDatabase>, adminId: string) {
  const mediaDir = join(process.cwd(), ".local", "media");
  await mkdir(mediaDir, { recursive: true });

  const mapping: Record<SeedItem["imageKey"], string> = {
    phone: "phone.png",
    laptop: "laptop.png",
    headphones: "headphones.png",
    "air-fryer": "air-fryer.png",
    shoes: "shoes.png",
    watch: "watch.png",
  };

  const mediaIds: Record<SeedItem["imageKey"], string> = {} as Record<SeedItem["imageKey"], string>;

  for (const [key, filename] of Object.entries(mapping) as [SeedItem["imageKey"], string][]) {
    const srcPath = join(process.cwd(), "public", "images", "products", filename);
    const pngBytes = await readFile(srcPath);

    // Normalize and convert to WebP
    const webpBuffer = await sharp(pngBytes)
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const uuidKey = `${randomUUID()}.webp`;
    await writeFile(join(mediaDir, uuidKey), webpBuffer);

    const media = await db.media.create({
      data: {
        storageKey: uuidKey,
        provider: "local",
        mimeType: "image/webp",
        byteSize: webpBuffer.length,
        width: 800,
        height: 800,
        alt: `${key} product image`,
        uploadedById: adminId,
      },
    });

    mediaIds[key] = media.id;
  }

  return mediaIds;
}

async function run() {
  console.log(`Starting generation of ${seedItems.length} published deals for infinite scroll...`);
  const db = getDatabase();

  const admin = await db.user.findFirst({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
  });
  if (!admin) {
    throw new Error("No active super admin user found to attribute deals to.");
  }

  // 1. Ensure all categories exist
  const categoryDefs = [
    { slug: "mobiles", name: "Mobiles & Tablets" },
    { slug: "laptops", name: "Laptops & Computers" },
    { slug: "electronics", name: "Electronics & Gadgets" },
    { slug: "appliances", name: "Appliances" },
    { slug: "home", name: "Home & Kitchen" },
    { slug: "men", name: "Fashion (Men)" },
    { slug: "women", name: "Fashion (Women)" },
    { slug: "beauty", name: "Beauty & Personal Care" },
    { slug: "sports", name: "Sports & Fitness" },
    { slug: "travel", name: "Travel Deals" },
  ];

  const categoryMap = new Map<string, string>();
  for (const cat of categoryDefs) {
    const existing = await db.category.findUnique({ where: { slug: cat.slug } });
    if (existing) {
      categoryMap.set(cat.slug, existing.id);
    } else {
      const created = await db.category.create({
        data: { slug: cat.slug, name: cat.name },
      });
      categoryMap.set(cat.slug, created.id);
    }
  }

  // 2. Ensure all merchants exist
  const merchantDefs = [
    { slug: "amazon", name: "Amazon India", websiteUrl: "https://www.amazon.in", affiliateHosts: ["amazon.in", "amzn.to"] },
    { slug: "flipkart", name: "Flipkart", websiteUrl: "https://www.flipkart.com", affiliateHosts: ["flipkart.com", "dl.flipkart.com"] },
    { slug: "myntra", name: "Myntra", websiteUrl: "https://www.myntra.com", affiliateHosts: ["myntra.com"] },
    { slug: "croma", name: "Croma", websiteUrl: "https://www.croma.com", affiliateHosts: ["croma.com"] },
    { slug: "cuelinks", name: "Tata CLiQ / Partner", websiteUrl: "https://www.tatacliq.com", affiliateHosts: ["tatacliq.com", "clnk.in"] },
    { slug: "reliancedigital", name: "Reliance Digital", websiteUrl: "https://www.reliancedigital.in", affiliateHosts: ["reliancedigital.in"] },
  ];

  const merchantMap = new Map<string, string>();
  for (const m of merchantDefs) {
    const existing = await db.merchant.findUnique({ where: { slug: m.slug } });
    if (existing) {
      merchantMap.set(m.slug, existing.id);
    } else {
      const created = await db.merchant.create({
        data: { slug: m.slug, name: m.name, websiteUrl: m.websiteUrl, affiliateHosts: m.affiliateHosts },
      });
      merchantMap.set(m.slug, created.id);
    }
  }

  // 3. Prepare real media records from public images
  console.log("Preparing WebP media assets...");
  const mediaMap = await prepareMediaAssets(db, admin.id);

  // 4. Stagger publication dates over the last 100 hours
  const now = Date.now();
  let createdCount = 0;

  for (let i = 0; i < seedItems.length; i++) {
    const item = seedItems[i];
    const categoryId = categoryMap.get(item.categorySlug);
    const merchantId = merchantMap.get(item.merchantSlug);
    const mediaId = mediaMap[item.imageKey];

    if (!categoryId || !merchantId || !mediaId) {
      console.error(`Skipping item ${item.title}: missing mapping.`);
      continue;
    }

    const baseSlug = slugify(item.title);
    let dealSlug = `${baseSlug}-${1000 + i}`;
    dealSlug = dealSlug.slice(0, 115);

    // Stagger publishedAt: 100 hours ago up to now, 1 hour apart each
    const hoursAgo = (seedItems.length - 1 - i) * 1;
    const publishedAt = new Date(now - hoursAgo * 3600 * 1000);

    const priceMinor = item.price * 100;
    const mrpMinor = item.mrp * 100;

    await db.deal.create({
      data: {
        slug: dealSlug,
        title: item.title,
        brand: item.brand,
        description: `${item.title}. Top discount offer available at ${item.merchantSlug.toUpperCase()}. Verified genuine deal.`,
        categoryId,
        merchantId,
        mediaId,
        mrpMinor,
        priceMinor,
        currency: "INR",
        rating: item.rating,
        reviewCount: item.reviewCount,
        ratingSource: `${merchantDefs.find(m => m.slug === item.merchantSlug)?.name ?? "Retailer"} Customer Ratings`,
        productUrl: `https://${merchantDefs.find(m => m.slug === item.merchantSlug)?.affiliateHosts[0] ?? "amazon.in"}/dp/${dealSlug}`,
        affiliateUrl: `https://${merchantDefs.find(m => m.slug === item.merchantSlug)?.affiliateHosts[0] ?? "amazon.in"}/dp/${dealSlug}?tag=metadeals4u-21`,
        status: "PUBLISHED",
        publishedAt,
        startsAt: publishedAt,
        expiresAt: new Date(now + (7 + (i % 20)) * 24 * 3600 * 1000), // expires in 7-27 days
        featured: Boolean(item.featured),
        trending: Boolean(item.trending),
        everPublished: true,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });

    createdCount++;
    if (createdCount % 20 === 0) {
      console.log(`Created ${createdCount} / ${seedItems.length} deals...`);
    }
  }

  const finalCount = await db.deal.count({ where: { status: "PUBLISHED" } });
  console.log(`\nSuccessfully created ${createdCount} new deals!`);
  console.log(`Total PUBLISHED deals in database: ${finalCount}`);

  await disconnectDatabase();
}

run().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
