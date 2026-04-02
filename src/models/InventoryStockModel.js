const mongoose = require('mongoose');

const brandList = [
  "Aigner", "Akribos Xxiv", "Alfred Dunhill", "Alviero Martini", "Apogsum", "AquaMarin", "Aquaswiss", "Armin Strom",
  "Audemars Piguet", "Balenciaga", "Ball", "Bernhard H. Mayer", "Bertolucci",
  "Blancpain", "Borja", "Boss By Hugo Boss", "Boucheron", "Breitling", "Breguet",
  "Burberry", "Bvlgari", "Carl F. Bucherer", "Cartier", "Celine", "Chanel", "Charriol", "Chaumet",
  "Chopard", "Chronoswiss", "Citizen", "Concord", "Corum", "CT Scuderia",
  "De Grisogno", "Dior", "Dolce & Gabbana", "Dubey & Schaldenbrand", "Ebel",
  "Edox", "Elini", "Emporio Armani", "Erhard Junghans", "Favre Leuba", "Fendi",
  "Ferre Milano", "Franck Muller", "Frederique Constant", "Gerald Genta",
  "Gianfranco Ferre", "Giorgio Armani", "Girard Perregaux", "Giuseppe Zanotti",
  "Givenchy", "Glam Rock", "Goyard", "Graham", "Grimoldi Milano", "Gucci",
  "Harry Winston", "Hermes", "Hublot", "Hysek", "Ingersoll", "IWC", "Jacob & Co.", "Jacques Lemans",
  "Jaeger LeCoultre", "Jean Marcel", "JeanRichard", "Jorg Hysek", "Joseph",
  "Junghans", "Just Cavalli", "Karl Lagerfeld", "KC", "Kenzo", "Korloff", "Lancaster",
  "Locman", "Longines", "Lord King", "Louis Frard", "Louis Moine", "Louis Vuitton",
  "Marc by Marc Jacobs", "Marc Jacobs", "Martin Braun", "Mauboussin",
  "Maurice Lacroix", "Meyers", "Michael Kors", "MICHAEL Michael Kors", "Mido",
  "Montblanc", "Montega", "Montegrappa", "Movado", "Navitec", "NB Yaeger",
  "Nina Ricci", "Nubeo", "Officina Del Tempo", "Omega", "Oris", "Panerai",
  "Parmigiani", "Patek Philippe", "Paul Picot", "Perrelet", "Philip Stein",
  "Piaget", "Pierre Balmain", "Porsche Design", "Prada", "Principessa", "Quinting", "Rado",
  "Rama Swiss Watch", "Raymond Weil", "Richard Mille", "Robergé",
  "Roberto Cavalli", "Rochas", "Roger Dubuis", "Rolex", "S.T. Dupont", "Saint Laurent Paris",
  "Salvatore Ferragamo", "Seiko", "Swarovski", "Swatch", "Tag Heuer", "Techno Com",
  "Technomarine", "Tiffany & Co.", "Tissot", "Tonino Lamborghini", "Trussardi",
  "Tudor", "U-Boat", "Ulysse Nardin", "Vacheron Constantin", "Valentino", "Van Cleef & Arpels", "Versace",
  "Yves Saint Laurent", "Zenith", "Other",
  "Sandoz","Bentley","Elgin","Jacques Lendl","Tom ford","Lord king table clock","Tower quartz"

];

const InventoryStockSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true },

  brand: {
    type: String,
    enum: brandList,
  },

  category: {
    type: String,
    enum: ['watch', 'Accessories', 'Leather Goods', 'Leather Bags']
  },

  internalCode: { type: String, trim: true, default: "" },
  quantity: { type: Number, default: 1 },

  status: {
    type: String,
    enum: ["AVAILABLE", "SOLD", "AUCTION"],
    default: "AVAILABLE"
  },

  cost: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  soldPrice: { type: Number, default: 0 },

  paymentMethod: {
    type: String,
    enum: ["cash", "stripe", "tabby", "chrono", "bank_transfer", "other","card/utap"],
    default: "cash"
  },

  receivingAmount: { type: Number, default: 0 },

  soldAt: { type: Date, default: null },

  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }

}, { timestamps: true });


module.exports = mongoose.models.InventoryStock || mongoose.model("InventoryStock", InventoryStockSchema);

