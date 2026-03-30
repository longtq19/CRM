
import { connectDB } from '../config/database';

const run = async () => {
    await connectDB();
    console.log('Seed script placeholder');
};

run();
