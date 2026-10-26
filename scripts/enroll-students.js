const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read MONGO_URI from .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const mongoMatch = envContent.match(/^MONGO_URI=(.*)$/m);

if (!mongoMatch || !mongoMatch[1]) {
  console.error('❌ Could not find MONGO_URI in .env');
  process.exit(1);
}

const MONGO_URI = mongoMatch[1].trim();
const COURSE_ID = 'tcbt-organic-farming-101';

const STUDENTS = [
  '9861422766',
  '9713608564',
  '9602545237',
  '6207099278',
  '9669054473',
  '8093964039',
  '7008091143',
  '9826525228',
  '6006608082',
  '8839031173',
  '9970803372',
  '9399398282',
  '8435006295',
  '9425685574',
  '6263767056',
  '9993862320',
  '9424100989',
  '8884647900',
  '9573504542',
  '6262283165',
  '8340378714',
  '9407985831',
  '9399444899',
  '8386830188',
  '8780154297',
  '9997202613',
  '9035198929',
  '6267781800',
  '9667804299',
  '9490372331',
  '9981761531',
  '9993108718',
  '9574112571',
  '9755371212',
  '9770030441',
  '9812999133',
  '8225858510',
  '7587190015',
  '8305327625',
  '9426788439',
  '9755174433',
  '9827198923',
  '9867165111',
  '9864561070',
  '8770573895',
  '9406061180',
  '9135603564',
  '7974724307',
  '7805994070',
  '7030699196',
  '9301982981',
  '9950324709',
  '7869683310',
  '9828851753',
  '9827181244',
  '8458881059',
  '8433154586',
  '9411843911',
];

async function run() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const usersCollection = mongoose.connection.collection('users');

  let newlyCreated = 0;
  let updatedExisting = 0;
  let alreadyEnrolled = 0;
  let errors = 0;

  console.log(`🎓 Processing ${STUDENTS.length} students for course: "${COURSE_ID}"...\n`);

  for (const raw of STUDENTS) {
    const cleanDigits = raw.replace(/\D/g, '').slice(-10);
    const withCountryCode = `+91${cleanDigits}`;

    try {
      // Find existing user by any format
      const existingUser = await usersCollection.findOne({
        $or: [
          { mobile_number: withCountryCode },
          { mobile_number: cleanDigits },
          { mobile_number: raw },
        ],
      });

      if (existingUser) {
        const enrolled = existingUser.enrolled_courses || [];
        if (enrolled.includes(COURSE_ID)) {
          alreadyEnrolled++;
          console.log(`ℹ️ [ALREADY ENROLLED] ${withCountryCode} (${existingUser.name || 'No Name'})`);
        } else {
          await usersCollection.updateOne(
            { _id: existingUser._id },
            { $addToSet: { enrolled_courses: COURSE_ID } }
          );
          updatedExisting++;
          console.log(`✅ [ENROLLED EXISTING] ${withCountryCode} (${existingUser.name || 'User'})`);
        }
      } else {
        // Pre-create user account with course already enrolled
        await usersCollection.insertOne({
          mobile_number: withCountryCode,
          enrolled_courses: [COURSE_ID],
          is_active: true,
          is_deleted: false,
          addresses: [],
          fcm_tokens: [],
          created_at: new Date(),
          updated_at: new Date(),
        });
        newlyCreated++;
        console.log(`🆕 [PRE-ENROLLED NEW] ${withCountryCode}`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ [ERROR] ${withCountryCode}: ${err.message}`);
    }
  }

  console.log('\n───────────────────────────────────────────────');
  console.log(`📊 Summary:`);
  console.log(`   Total Processed:  ${STUDENTS.length}`);
  console.log(`   Newly Created:    ${newlyCreated}`);
  console.log(`   Updated Existing: ${updatedExisting}`);
  console.log(`   Already Enrolled: ${alreadyEnrolled}`);
  console.log(`   Errors:           ${errors}`);
  console.log('───────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB. Complete!');
}

run().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
