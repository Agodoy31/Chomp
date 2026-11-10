import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | null = null;

/**
 * Connect to an isolated in-memory MongoDB replica set.
 * Starts a new MongoMemoryReplSet with a single node if one is not already running.
 * Single node replica set provides full multi document transaction support.
 */
export const connectTestDb = async (): Promise<void> => {
  if (!replSet) {
    replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
    });
  }
  const uri = replSet.getUri();

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
};

/**
 * Remove all documents across all collections in the in-memory database.
 * Use in afterEach hooks to ensure complete test isolation.
 * Collections named in keepCollections are left alone, such as users who stay logged in for a whole file.
 */
export const clearTestDb = async (keepCollections: string[] = []): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    const clearPromises = Object.keys(collections)
      .filter((key) => !keepCollections.includes(key))
      .map((key) => collections[key].deleteMany({}));
    await Promise.all(clearPromises);
  }
};

/**
 * Drop the database, close the Mongoose connection, and stop the in-memory replica set.
 * Use in afterAll hooks to ensure clean test suite teardown.
 */
export const closeTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
};
