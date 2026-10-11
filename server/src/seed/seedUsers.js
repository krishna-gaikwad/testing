// Set server process timezone
process.env.TZ = process.env.CITY_TIMEZONE || 'Asia/Kolkata';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { UserStore, memoryStore } = require('../services/memoryStore');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234';

const demoUsers = [
  // 1 Reviewer
  {
    name: 'Suresh Deshmukh (Reviewer, PMC Demo)',
    email: 'reviewer@pmc.demo.local',
    role: 'reviewer',
    department: null
  },
  // 4 Officers (one per department: waste, roads, water, others)
  {
    name: 'Anjali Kulkarni (Waste Officer, PMC Demo)',
    email: 'officer.waste@pmc.demo.local',
    role: 'officer',
    department: 'waste'
  },
  {
    name: 'Rohan Patil (Roads Officer, PMC Demo)',
    email: 'officer.roads@pmc.demo.local',
    role: 'officer',
    department: 'roads'
  },
  {
    name: 'Meera Joshi (Water Officer, PMC Demo)',
    email: 'officer.water@pmc.demo.local',
    role: 'officer',
    department: 'water'
  },
  {
    name: 'Vikram Shinde (General Officer, PMC Demo)',
    email: 'officer.others@pmc.demo.local',
    role: 'officer',
    department: 'others'
  },
  // 1 Supervisor
  {
    name: 'Dr. Rajesh Gaikwad (Zonal Supervisor, PMC Demo)',
    email: 'supervisor@pmc.demo.local',
    role: 'supervisor',
    department: 'roads'
  },
  // 6 Citizens
  {
    name: 'Pooja Kadam (Citizen Demo)',
    email: 'pooja.citizen@demo.in',
    role: 'citizen',
    department: null
  },
  {
    name: 'Amitabh More (Citizen Demo)',
    email: 'amitabh.citizen@demo.in',
    role: 'citizen',
    department: null
  },
  {
    name: 'Sunita Chavan (Citizen Demo)',
    email: 'sunita.citizen@demo.in',
    role: 'citizen',
    department: null
  },
  {
    name: 'Nikhil Pawar (Citizen Demo)',
    email: 'nikhil.citizen@demo.in',
    role: 'citizen',
    department: null
  },
  {
    name: 'Neha Tambe (Citizen Demo)',
    email: 'neha.citizen@demo.in',
    role: 'citizen',
    department: null
  },
  {
    name: 'Sachin Jadhav (Citizen Demo)',
    email: 'sachin.citizen@demo.in',
    role: 'citizen',
    department: null
  }
];

async function seedDatabase() {
  console.log('\n======================================================');
  console.log('🌱 NAGAR SETU (PUNE) - DEMO DATABASE SEED SCRIPT');
  console.log('⚠️  NOTE: ALL ACCOUNTS CREATED ARE DEMO ACCOUNTS ONLY');
  console.log('======================================================\n');

  try {
    await connectDB();
    const isMongoConnected = mongoose.connection.readyState === 1;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, salt);

    if (isMongoConnected) {
      const User = require('../models/User');
      console.log('📦 Connected to MongoDB. Seeding users into collection...');
      for (const userData of demoUsers) {
        await User.findOneAndUpdate(
          { email: userData.email },
          {
            $set: {
              name: userData.name,
              email: userData.email,
              passwordHash,
              role: userData.role,
              department: userData.department,
              isActive: true,
              createdAt: new Date()
            }
          },
          { upsert: true, new: true, runValidators: true }
        );
      }
    } else {
      console.log('ℹ️ Running with in-memory store fallback for demo mode.');
      for (const userData of demoUsers) {
        const existing = memoryStore.users.find(u => u.email === userData.email);
        if (!existing) {
          memoryStore.users.push({
            _id: Math.random().toString(36).substring(2, 15),
            name: userData.name,
            email: userData.email,
            passwordHash,
            role: userData.role,
            department: userData.department,
            isActive: true,
            createdAt: new Date()
          });
        }
      }
    }

    console.log('✅ Demo accounts seeded successfully!\n');
    console.log('🔑 SHARED DEMO PASSWORD FOR ALL ACCOUNTS:', DEMO_PASSWORD);

    const { seedComplaints } = require('./seedComplaints');
    await seedComplaints();

    console.log('------------------------------------------------------');
    console.log('DEMO ACCOUNTS OVERVIEW:');
    demoUsers.forEach((u, i) => {
      const deptStr = u.department ? ` [Dept: ${u.department}]` : '';
      console.log(`${(i + 1).toString().padStart(2, ' ')}. [${u.role.toUpperCase()}] ${u.name}`);
      console.log(`    Email: ${u.email}${deptStr}`);
    });
    console.log('------------------------------------------------------');
    console.log(`Timezone: ${process.env.TZ} | Current Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`);
    
    if (require.main === module) {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Seeding error:', error.message);
    if (require.main === module) {
      process.exit(1);
    }
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, demoUsers, DEMO_PASSWORD };
