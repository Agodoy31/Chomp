import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

/**
 * Connect to an isolated in-memory MongoDB instance.
 * Starts a new MongoMemoryServer if one is not already running.
 */
export const connectTestDb = async (): Promise<void> => {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
  }
  const uri = mongoServer.getUri();

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
};

/**
 * Remove all documents across all collections in the in-memory database.
 * Use in afterEach hooks to ensure complete test isolation.
 */
export const clearTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    const clearPromises = Object.keys(collections).map((key) =>
      collections[key].deleteMany({})
    );
    await Promise.all(clearPromises);
  }
};

/**
 * Drop the database, close the Mongoose connection, and stop the in-memory server.
 * Use in afterAll hooks to ensure clean test suite teardown.
 */
export const closeTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};
