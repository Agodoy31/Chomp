import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../user/models/User';
import { Club } from '../clubs/model/clubModel';
import { Membership } from '../clubs/model/membershipModel';
import { hashPassword } from '../user/utils/passwordHashing';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chomp';

async function seedDatabase(): Promise<void> {
  console.log(`Connecting to database at ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);

  console.log('Clearing existing users, clubs, and memberships...');
  await User.deleteMany({});
  await Club.deleteMany({});
  await Membership.deleteMany({});

  console.log('Hashing default presentation password with argon2id...');
  const hashedPassword = await hashPassword('Gators2026!');

  console.log('Seeding team and student accounts...');
  const usersToCreate = [
    {
      firstName: 'Albert',
      lastName: 'Gator',
      email: 'albert@ufl.edu',
      hashedPassword,
      bio: 'Official mascot and premier ambassador of the Gator Nation.',
      isAdmin: true,
    },
    {
      firstName: 'Andres',
      lastName: 'Godoy',
      email: 'andres@ufl.edu',
      hashedPassword,
      bio: 'Lead backend architect and distributed systems enthusiast.',
      isAdmin: false,
    },
    {
      firstName: 'Sephora',
      lastName: 'Pierrelouis',
      email: 'sephora@ufl.edu',
      hashedPassword,
      bio: 'Frontend engineer crafting accessible user interfaces for Chomp.',
      isAdmin: false,
    },
    {
      firstName: 'Michael',
      lastName: 'Capelli',
      email: 'michael@ufl.edu',
      hashedPassword,
      bio: 'Software engineer building real-time messaging and chat pages.',
      isAdmin: false,
    },
    {
      firstName: 'Alejandro',
      lastName: 'Jimenez',
      email: 'alejandro@ufl.edu',
      hashedPassword,
      bio: 'Full stack developer managing organization data and endpoints.',
      isAdmin: false,
    },
    {
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
      hashedPassword,
      bio: 'Promise keeper and two time national champion quarterback.',
      isAdmin: false,
    },
    {
      firstName: 'Alberta',
      lastName: 'Gator',
      email: 'alberta@ufl.edu',
      hashedPassword,
      bio: 'First lady of the swamp and champion of campus spirit.',
      isAdmin: false,
    },
    {
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
      hashedPassword,
      bio: 'Turlington plaza regular and vocal outdoor campus philosopher.',
      isAdmin: false,
    },
    {
      firstName: 'Maya',
      lastName: 'Lin',
      email: 'maya.lin@ufl.edu',
      hashedPassword,
      bio: 'Architecture junior mapping out campus quiet study nooks.',
      isAdmin: false,
    },
    {
      firstName: 'Mateo',
      lastName: 'Vargas',
      email: 'mateo.vargas@ufl.edu',
      hashedPassword,
      bio: 'Computer engineering sophomore surviving on nitro cold brew.',
      isAdmin: false,
    },
  ];

  const createdUsers = await User.insertMany(usersToCreate);
  console.log(`Created ${createdUsers.length} accounts.`);

  const albertId = createdUsers[0]._id;
  const andresId = createdUsers[1]._id;
  const sephoraId = createdUsers[2]._id;
  const michaelId = createdUsers[3]._id;
  const alejandroId = createdUsers[4]._id;
  const tebowId = createdUsers[5]._id;

  console.log('Seeding 24 approved campus clubs (12 serious and 12 funny)...');
  const clubsToCreate = [
    // 12 Serious Clubs
    {
      name: 'Gator Open Source Club',
      description:
        'We are an engineering community focused on contributing to public open source ecosystems and building software tools for the University of Florida community. We guide members through their first pull requests, explore systems architectures in production, conduct code reviews on live open repositories, and maintain student utilities used across campus. Whether you are curious about Docker containers, distributed databases, modern frontend frameworks, or Linux kernel patches, we provide an active collaborative space for engineers to build software that outlasts their college careers.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Tuesday',
        time: '6:30 PM',
        location: 'Malachowsky Hall 1001',
      },
      proposerId: andresId,
      status: 'APPROVED',
    },
    {
      name: 'Society of Software Engineers',
      description:
        'The Society of Software Engineers connects students passionate about building software with peer mentorship, technical workshops, and industry networking. Our weekly meetings cover end-to-end full stack development, cloud deployments, data structures and algorithms practice, and mock technical interviews with engineers from top technology companies. We host hack nights where members collaborate on portfolio projects, share resume feedback, and prepare for internship recruiting cycles in a supportive, student-led environment.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Wednesday',
        time: '6:00 PM',
        location: 'Marston Science Library L107',
      },
      proposerId: sephoraId,
      status: 'APPROVED',
    },
    {
      name: 'Association for Computing Machinery',
      description:
        'The University of Florida chapter of the Association for Computing Machinery serves as the central computing student organization on campus. We organize specialized technical sub-teams in cybersecurity, competitive programming, game design, and artificial intelligence. Our members participate in national programming competitions, organize campus-wide hackathons, host faculty research panels, and collaborate on interdisciplinary engineering projects that push the boundaries of undergraduate computing.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Thursday',
        time: '7:00 PM',
        location: 'CSE E220',
      },
      proposerId: michaelId,
      status: 'APPROVED',
    },
    {
      name: 'Women in Computer Science and Engineering',
      description:
        'Women in Computer Science and Engineering provides community, professional development, and technical mentorship for women and non-binary students in technology. We host corporate tech talks, sponsor members to attend national conferences like the Grace Hopper Celebration, organize hands-on coding bootcamps, and run an active peer mentorship program pairing underclassmen with experienced upperclassmen. We believe in closing the tech gender gap through tangible skills, leadership opportunities, and community.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Monday',
        time: '6:00 PM',
        location: 'Malachowsky Hall 2002',
      },
      proposerId: sephoraId,
      status: 'APPROVED',
    },
    {
      name: 'IEEE Student Branch at UF',
      description:
        'The Institute of Electrical and Electronics Engineers student branch at UF brings together electrical, computer, and biomedical engineers. We provide access to hardware test benches, soldering stations, PCB design workshops, and embedded systems tutorials. Members gain practical engineering experience building autonomous robots, audio synthesizers, and RF communications gear while connecting with alumni working in defense, aerospace, and consumer electronics.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Thursday',
        time: '6:30 PM',
        location: 'Larsen Hall 234',
      },
      proposerId: alejandroId,
      status: 'APPROVED',
    },
    {
      name: 'Gator Robotics',
      description:
        'Gator Robotics is an interdisciplinary student engineering organization that designs, fabricates, and programs complex autonomous ground vehicles for national collegiate competitions. Our sub-teams span software systems, electrical power distribution, computer vision, and mechanical chassis design. Members gain hands-on experience using industrial CAD, computer numerical control machining, ROS2 robot operating system, and sensor fusion algorithms to solve real robotics challenges.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Saturday',
        time: '11:00 AM',
        location: 'MAE Design Studio 112',
      },
      proposerId: andresId,
      status: 'APPROVED',
    },
    {
      name: 'Gator Solar Car',
      description:
        'Gator Solar Car designs, manufactures, and races multi-occupant solar electric vehicles across the American Solar Challenge. Our student team integrates custom carbon fiber aeroshells, high-efficiency silicon photovoltaic arrays, regenerative braking systems, and telemetry dashboards. We welcome engineering, business, and design students who want to build a fully street-legal solar race vehicle from the ground up.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Saturday',
        time: '10:00 AM',
        location: 'Weil Hall Machine Shop',
      },
      proposerId: michaelId,
      status: 'APPROVED',
    },
    {
      name: 'Florida Running Club',
      description:
        'The Florida Running Club is a co-ed collegiate running club welcoming runners of all skill levels, from beginners running their first mile to competitive athletes training for national club cross country and track championships. We host daily group runs through campus trails, speed interval workouts on the track, and long weekend trail runs in San Felasco Hammock. We foster healthy habits, lasting friendships, and sportsmanship without attendance pressure.',
      category: 'SPORTS',
      meeting: {
        day: 'Monday through Thursday',
        time: '5:30 PM',
        location: 'Percy Beard Track Grandstands',
      },
      proposerId: tebowId,
      status: 'APPROVED',
    },
    {
      name: 'UF Brazilian Jiu Jitsu',
      description:
        'UF Brazilian Jiu Jitsu teaches practical self-defense, ground grappling, and submission wrestling in a safe, controlled training environment. Practices consist of warm-ups, technical instruction led by experienced student belts, and structured positional sparring. We emphasize leverage, technique, and discipline over pure physical strength. Beginners with zero martial arts experience are warmly welcomed, and clean loaner gis are available for new members.',
      category: 'SPORTS',
      meeting: {
        day: 'Tuesday and Thursday',
        time: '7:30 PM',
        location: 'Southwest Rec Combat Room',
      },
      proposerId: albertId,
      status: 'APPROVED',
    },
    {
      name: 'Florida Club Swimming',
      description:
        'Florida Club Swimming offers structured swim practices and collegiate competition for swimmers of all backgrounds who want to stay in shape without the varsity commitment. We compete in collegiate club invitationals across the Southeast and travel to the national championships each spring. Practices accommodate multiple lane speeds ranging from stroke technique and endurance fitness to high-intensity sprint training.',
      category: 'SPORTS',
      meeting: {
        day: 'Monday through Thursday',
        time: '7:00 PM',
        location: 'Florida Pool Lap Lanes',
      },
      proposerId: tebowId,
      status: 'APPROVED',
    },
    {
      name: 'Gator Salsa Club',
      description:
        'Gator Salsa Club celebrates Latin dance, music, and community at the University of Florida. Every Friday night we offer beginner-friendly and intermediate lessons in Cuban Salsa, Bachata, and Merengue taught by student instructors, followed by open social dancing with live DJs. No partner or dance experience is required. We promote cultural appreciation, confidence, and inclusivity through the universal language of dance.',
      category: 'CULTURAL',
      meeting: {
        day: 'Friday',
        time: '7:00 PM',
        location: 'Reitz Union Rion Ballroom',
      },
      proposerId: alejandroId,
      status: 'APPROVED',
    },
    {
      name: 'Hispanic Student Association',
      description:
        'The Hispanic Student Association is the largest student-run cultural organization at the University of Florida. We serve as an umbrella community unifying sixteen affiliated cultural sub-organizations while promoting Hispanic culture, academic excellence, leadership development, and civic engagement across campus. We host cultural showcases, leadership banquets, community service volunteer days, and mentorship initiatives that support Hispanic and Latino student success.',
      category: 'CULTURAL',
      meeting: {
        day: 'Tuesday',
        time: '7:00 PM',
        location: 'Reitz Union Grand Ballroom',
      },
      proposerId: andresId,
      status: 'APPROVED',
    },

    // 12 Campus Lore and Funny Clubs
    {
      name: 'CSE 3 AM Hackers',
      description:
        'We write code exclusively between midnight and dawn while surviving on vending machine Celsius, stale Pop Tarts, and raw panic. If you enjoy debugging C pointer segfaults at three in the morning, yelling at git rebase merge conflicts, or passionately arguing that tabs are superior to spaces, this is your home. Bring your laptop, your charger, and whatever sanity you have left before the compiler takes it too.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Tuesday and Thursday',
        time: '3:00 AM',
        location: 'CSE E211 Basement Lab',
      },
      proposerId: michaelId,
      status: 'APPROVED',
    },
    {
      name: 'Marston Basement Dungeon Crawlers',
      description:
        'Deep beneath the silent study floors where sunlight has never touched, we gather in the carpeted catacombs to grind calculus problem sets, assemble electrical breadboards, and trade rumors about the mythical third floor silence police. We offer mutual moral support, spare graphing calculator batteries, and emergency whiteout. If you can tolerate the hum of industrial ventilation and fluorescent lighting at midnight, your seat is reserved.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Wednesday',
        time: '11:00 PM',
        location: 'Marston Science Library Basement',
      },
      proposerId: sephoraId,
      status: 'APPROVED',
    },
    {
      name: 'Heavy Machinery Reverse Engineers',
      description:
        'Every week we walk past active campus construction sites, admire the yellow excavators and jackhammers, and try to figure out how they work before campus security politely asks us to step outside the chain link fence. We discuss diesel torque curves, hydraulic fluid pressures, and the physics of why campus pathways are permanently under construction. Hard hats are optional but strongly respected.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Friday',
        time: '4:30 PM',
        location: 'Weil Hall Courtyard',
      },
      proposerId: alejandroId,
      status: 'APPROVED',
    },
    {
      name: 'Southwest Rec Bench Press Queue Society',
      description:
        'We are dedicated to the sacred campus art of standing in a cluster near the flat benches at peak gym hours, scrolling through social media between three-minute rest intervals, and asking someone how many sets they have left every ninety seconds. All fitness levels are welcome. Spotting form and pre-workout flavor reviews provided on site.',
      category: 'SPORTS',
      meeting: {
        day: 'Monday',
        time: '6:00 PM',
        location: 'Southwest Recreation Center Weight Room',
      },
      proposerId: tebowId,
      status: 'APPROVED',
    },
    {
      name: 'Lake Alice Sunset Joggers',
      description:
        'We jog the perimeter loop right as the bats wake up and swarm the evening sky. Our pacing strategy is simple: run fast enough to stay ahead of the mosquitoes, keep an eye out for resident alligators sunbathing on the bank, and pause at the boardwalk to admire the orange and blue Florida sunset. We leave nobody behind unless an alligator makes a sudden move, in which case personal sprint personal records will be attempted.',
      category: 'SPORTS',
      meeting: {
        day: 'Sunday',
        time: '7:00 PM',
        location: 'Lake Alice Bat Houses Boardwalk',
      },
      proposerId: albertId,
      status: 'APPROVED',
    },
    {
      name: 'Swamp Spikeball League',
      description:
        'We set up circular trampolines on the grass, blast music from portable speakers, and dive horizontally across the turf for rim shots that may or may not count according to the official rulebook. Whether you are a tournament veteran with a lethal backhand flick or a beginner who repeatedly spikes the ball directly into your own shin, we have a net waiting for you. Sunscreen and hydration heavily encouraged.',
      category: 'SPORTS',
      meeting: {
        day: 'Saturday',
        time: '2:00 PM',
        location: 'Flavet Field Lawn',
      },
      proposerId: tebowId,
      status: 'APPROVED',
    },
    {
      name: 'Gator Lettuce Eating Club',
      description:
        'We bring whole heads of raw iceberg lettuce to the lawn, start a countdown timer, and furiously consume the entire leafy sphere using our bare hands and sheer adrenaline. Salad dressing is considered a sign of weakness. Sips of water are forbidden until the bitter central core is completely swallowed. If you harbor an uncontrollable desire to inhale ninety calories of crunchy water in under three minutes while fifty cheering strangers film you for campus meme pages, welcome to the championship circle. Bring a grocery bag, a bib, and zero self respect.',
      category: 'SPORTS',
      meeting: {
        day: 'Friday',
        time: '5:00 PM',
        location: 'Plaza of the Americas Grass',
      },
      proposerId: albertId,
      status: 'APPROVED',
    },
    {
      name: 'Plaza of the Americas Hammock Sleepers',
      description:
        'We string nylon hammocks between century old oak trees and sleep through three consecutive afternoon lectures. We evaluate optimal branch heights, test knot tensile strengths, and research the exact acoustic frequencies of campus leaf blowers to build mental resilience. If you can doze off comfortably while skateboarding students swerve around your hanging feet, your application is pre-approved.',
      category: 'OTHER',
      meeting: {
        day: 'Monday and Wednesday',
        time: '1:30 PM',
        location: 'Plaza of the Americas Oak Trees',
      },
      proposerId: sephoraId,
      status: 'APPROVED',
    },
    {
      name: 'Chomp Streetwear Collective',
      description:
        'We obsess over thrifted vintage Gator gear, oversized Champion hoodies from the nineties, and limited drop sneakers. We stage impromptu fashion shoots against raw concrete campus brutalism and debate the cultural significance of wearing orange and blue corduroy jackets in eighty degree weather. If your wardrobe has more orange than your mother considers tasteful, pull up.',
      category: 'CULTURAL',
      meeting: {
        day: 'Thursday',
        time: '6:30 PM',
        location: 'Reitz Union North Lawn',
      },
      proposerId: michaelId,
      status: 'APPROVED',
    },
    {
      name: 'Century Tower Bell Ringer Guild',
      description:
        'We are fascinated by the carillon bells ringing across campus every fifteen minutes. We study sheet music rearranged for sixty one bells, practice air chimes on imaginary batons, and debate whether the noon chimes should play the Alma Mater or video game soundtracks. We also keep a watchful eye for ghost stories and urban legends about the bell tower interior. Earplugs available upon request.',
      category: 'CULTURAL',
      meeting: {
        day: 'Sunday',
        time: '12:00 PM',
        location: 'Century Tower Ground Entrance',
      },
      proposerId: andresId,
      status: 'APPROVED',
    },
    {
      name: 'Midtown Uber Fare Splitters Syndicate',
      description:
        'We are dedicated to the high stakes financial logistics of dividing a forty dollar surge pricing ride across seven broke college students at two in the morning. We calculate split percentages down to the cent on Venmo before the driver cancels the pickup, track lost credit cards and single high heels, and maintain a strict code of silence regarding who fell asleep on whose shoulder in the third row seat.',
      category: 'OTHER',
      meeting: {
        day: 'Saturday',
        time: '1:45 AM',
        location: 'West University Avenue Sidewalk Outside MacDinton',
      },
      proposerId: alejandroId,
      status: 'APPROVED',
    },
    {
      name: 'Broward Dining Forensic Crime Scene Unit',
      description:
        'Somebody has to ask why the mac and cheese is gray. We are that somebody. Our detectives wear lab goggles over their Crocs, collect fluid samples of the murky brown syrup sputtering out of the malfunctioning soda machines, and investigate how the powdered scrambled eggs manage to be simultaneously crusty and watery under the heat lamps. We run a midnight anti food poisoning pill hotline with same night Pepto and Pedialyte deliveries to any dorm room, no questions asked. We take the internal temperature of every lukewarm hot dog and publish the results as a heartbreaking weekly bulletin. We have carbon dated a dinner roll and the findings are still classified. Every case ends the same way: yellow caution tape around the omelet station, a group chant of the egg was not cooked, and a sworn oath to return tomorrow because the meal plan is already paid for.',
      category: 'ACADEMIC',
      meeting: {
        day: 'Sunday',
        time: '6:00 PM',
        location: 'Broward Dining Hall Booths Next To Pure Eats',
      },
      proposerId: andresId,
      status: 'APPROVED',
    },
  ];

  const createdClubs = await Club.insertMany(clubsToCreate);
  console.log(`Created ${createdClubs.length} approved campus clubs.`);

  console.log('Seeding initial memberships for team and demo accounts...');
  const membershipsToCreate = [
    {
      userId: andresId,
      clubId: createdClubs[0]._id, // Gator Open Source Club
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: sephoraId,
      clubId: createdClubs[1]._id, // Society of Software Engineers
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: michaelId,
      clubId: createdClubs[2]._id, // ACM
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: sephoraId,
      clubId: createdClubs[3]._id, // WiCSE
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: andresId,
      clubId: createdClubs[5]._id, // Gator Robotics
      role: 'MEMBER',
      status: 'ACTIVE',
    },
    {
      userId: tebowId,
      clubId: createdClubs[7]._id, // Florida Running Club
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: albertId,
      clubId: createdClubs[8]._id, // UF BJJ
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: alejandroId,
      clubId: createdClubs[10]._id, // Gator Salsa Club
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: andresId,
      clubId: createdClubs[11]._id, // Hispanic Student Association
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: michaelId,
      clubId: createdClubs[12]._id, // CSE 3 AM Hackers
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: albertId,
      clubId: createdClubs[18]._id, // Gator Lettuce Eating Club
      role: 'OFFICER',
      status: 'ACTIVE',
    },
    {
      userId: andresId,
      clubId: createdClubs[23]._id, // Broward Dining Forensic Crime Scene Unit
      role: 'OFFICER',
      status: 'ACTIVE',
    },
  ];

  await Membership.insertMany(membershipsToCreate);
  console.log(`Created ${membershipsToCreate.length} active memberships.`);

  console.log('Seed completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

seedDatabase().catch((error) => {
  console.error('Database seeding failed with error:', error);
  process.exit(1);
});
