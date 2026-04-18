const FUNCTION_CATEGORIES = {
  "Functions Set 1": [
    "Search", "Our suggestion", "Date Suggestion", "Moon phase", "Minute repeater",
    "Chronograph", "Double chronograph", "Flyback", "Panorama date", "Chiming clock",
    "Repeater", "Tourbillon", "Weekday", "Month", "Year", "Annual calendar",
    "4-year calendar", "Perpetual calendar"
  ],
  "Functions Set 2": [
    "Continuous hands", "Tempered blue hands", "Genevian Seal", "Chronometer",
    "Power Reserve Display", "Rotating Bezel", "Limited Edition", "Crown Left",
    "Screw-Down Crown", "Helium Valve", "Quick Set", "Screw-Down Push-Buttons",
    "Only Original Parts", "Luminous indices", "PVD/DLC coating", "World time watch",
    "Master Chronometer", "Smartwatch"
  ],
  "Functions Set 3": [
    "Solar watch", "One-hand watches", "Vintage"
  ],
  "Functions Set 4": [
    "Alarm", "GMT", "Equation of time", "Jumping hour", "Tachymeter"
  ]
};

const ALL_FUNCTIONS = [
  ...FUNCTION_CATEGORIES["Functions Set 1"],
  ...FUNCTION_CATEGORIES["Functions Set 2"],
  ...FUNCTION_CATEGORIES["Functions Set 3"],
  ...FUNCTION_CATEGORIES["Functions Set 4"]
];

const WATCH_TYPES = [
  "Wrist Watch",
  "Pocket Watch", 
  "Clocks",
  "Stopwatch",
  "Smart Watch",
  
];

const WATCHSTYLE_CATEGORY = [
  "luxury watch",
  "Classic watch",
  "Sports watch",
  "Vintage watch",
  "Dress watch",
  "Drivers watch", 
  "pilot watch",
  "Racing watch"
];

const SCOPE_OF_DELIVERY_OPTIONS = [
  "Full Set (Watch + Original Box + Original Papers)",
  "Watch with Original Papers",
  "Watch with Original Box",
  "Watch with Montres Safe Box",
  "Watch Only"
];

const INCLUDE_ACCESSORIES = [
  "Extra Strap",
  "Original Strap", 
  "Warranty Card",
  "Certificate",
  "Travel Case",
  "Bezel Protector",
  "Cleaning Cloth",
  "Other Accessories"
];

const CONDITIONS = [
  "Brand New",
  "Unworn / Like New",
  "Pre-Owned",
  "Excellent",
  "Not Working / For Parts"
];

const ITEM_CONDITIONS = [
  "Excellent",
  "Good", 
  "Fair",
  "Poor / Not Working / For Parts"
];

const GENDERS = ["Men/Unisex", "Women"];

const MOVEMENTS = [
  "Automatic", "Quartz", "Manual", "Solar", "Kinetic", "Mechanical"
];

const COLORS = [
  "Black", "White", "Gold/Silver", "Silver", "Gold", "Rose Gold", "Blue", "Green", "Red",
  "Brown", "Gray", "Yellow", "Orange", "Purple", "Pink", "Champagne",
  // Leather goods & accessory colors
  "Multi-color", "Transparent", "Metallic", "Chrome", "Gunmetal", "Beige"
];

const MATERIALS = [
  "Stainless Steel", "Gold/Steel", "Gold", "Steel", "Rose Gold", "Platinum", "Titanium", "Ceramic",
  "Carbon Fiber", "Brass", "Bronze", "Aluminum"
];

const DIALNUMERALS = [
  "Arabic Numerals",
  "Roman Numerals", 
  "No Numerals",
  "Lines",
  "Gemstone",
  "Dot/round marker"
];

const STRAP_MATERIALS = [
  "Alligator",
  "Canvas",
  "Crocodile",
  "Fabric",
  "Gold",
  "Gold/Steel",
  "Leather",
  "Metal Bracelet",
  "Nylon",
  "Rubber",
  "Silicone",
  "Suede",
  "Steel",
  "18k White Gold"
];

const CRYSTALS = [
  "Sapphire", "Mineral", "Acrylic", "Hardlex", "Plexiglass"
];
const BEZEL_MATERIALS = [
  "Aluminum",
  "Ceramic",
  "Gold",
  "18k Yellow Gold",
  "Gold Plated",
  "Rubber",
  "Stainless Steel",
  "Titanium",
  "Tungsten"
];


const REPLACEMENT_PARTS = [
  "Dial",
  "Crown",
  "Clasp",
  "Leather strap",
  "Bezel",
  "Hands", 
  "Pusher",
  "Crystal",
  "Coating",
  "Diamond finishing",
  "Metal bracelet",
  "Case back",
  "Movement replacement parts",
];

module.exports = {
  FUNCTION_CATEGORIES,
  ALL_FUNCTIONS,
  SCOPE_OF_DELIVERY_OPTIONS,
  WATCH_TYPES,
  WATCHSTYLE_CATEGORY,
  GENDERS,
  MOVEMENTS,
  COLORS,
  MATERIALS,
  STRAP_MATERIALS,
  CRYSTALS,
  BEZEL_MATERIALS,
  CONDITIONS,
  ITEM_CONDITIONS,
  INCLUDE_ACCESSORIES,
  REPLACEMENT_PARTS,
  DIALNUMERALS,

};