const mongoose = require('mongoose');

const uri = "mongodb://monterodeveloper82_db_user:Montres123@ac-x1yeyl4-shard-00-00.xbg6rgl.mongodb.net:27017,ac-x1yeyl4-shard-00-01.xbg6rgl.mongodb.net:27017,ac-x1yeyl4-shard-00-02.xbg6rgl.mongodb.net:27017/?ssl=true&replicaSet=atlas-ipf6s3-shard-0&authSource=admin&retryWrites=true&w=majority&appName=MontersTeam";

async function run() {
  await mongoose.connect(uri);
  // It's possible the models are not loaded here, so we will use mongoose raw connection
  const db = mongoose.connection.db;
  const productsCollection = db.collection('products');
  
  // Find all products that start with "Seiko"
  const products = await productsCollection.find({ brand: { $regex: /seiko/i } }).toArray();
  
  for (let p of products) {
    if (p.name.includes("Sport") || p.name.includes("5")) {
        console.log(`_id: ${p._id}, name: ${p.name}, slug: ${p.slug}`);
    }
  }

  process.exit(0);
}

run().catch(console.error);
