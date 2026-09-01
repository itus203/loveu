const path=require('path');
const sqlite3=require('sqlite3').verbose();
const {open}=require('sqlite');
(async()=>{
  const db=await open({filename: path.join(__dirname, 'database.sqlite'), driver: sqlite3.Database});
  await db.exec("INSERT OR IGNORE INTO food_vendors (id, name, location, category, description, opening_time, closing_time, rating, is_active) VALUES (1, 'DIU Central Cafeteria', 'Academic Building 1, Ground Floor', 'Cafeteria', 'Main campus cafeteria with Bengali, Chinese and fast food', '7:30 AM', '8:00 PM', 4.5, 1)");
  await db.exec("INSERT OR IGNORE INTO food_vendors (id, name, location, category, description, opening_time, closing_time, rating, is_active) VALUES (2, 'Campus Canteen', 'Near DSC Gate', 'Bengali', 'Affordable Bengali meals, snacks and tea', '8:00 AM', '9:00 PM', 4.2, 1)");
  await db.exec("INSERT OR IGNORE INTO food_vendors (id, name, location, category, description, opening_time, closing_time, rating, is_active) VALUES (3, 'Food Corner', 'Student Dormitory Area', 'Fast Food', 'Burgers, pizza, fried chicken and cold drinks', '10:00 AM', '10:00 PM', 4.0, 1)");
  await db.exec("INSERT OR IGNORE INTO food_items (id, vendor_id, name, description, price, category, is_available) VALUES (1, 1, 'Chicken Biryani', 'Fragrant rice with chicken and egg', 120, 'Bengali', 1)");
  await db.exec("INSERT OR IGNORE INTO food_items (id, vendor_id, name, description, price, category, is_available) VALUES (2, 1, 'Fried Rice with Chicken', 'Chinese style fried rice', 100, 'Chinese', 1)");
  await db.exec("INSERT OR IGNORE INTO food_items (id, vendor_id, name, description, price, category, is_available) VALUES (3, 2, 'Paratha & Curry', 'Hot paratha with mixed vegetable curry', 40, 'Bengali', 1)");
  await db.exec("INSERT OR IGNORE INTO food_items (id, vendor_id, name, description, price, category, is_available) VALUES (4, 3, 'Chicken Burger', 'Crispy chicken burger with fries', 80, 'Fast Food', 1)");
  console.log('seeded');
  const v=await db.all('SELECT * FROM food_vendors');
  console.log(v);
  await db.close();
})();
