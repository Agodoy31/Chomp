import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose, { Schema, model } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from './db';

interface TestItem {
  name: string;
  count: number;
}

const testItemSchema = new Schema<TestItem>({
  name: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
});

const TestItemModel = model<TestItem>('TestItem', testItemSchema);

describe('In-Memory MongoDB Test Helper', () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('should establish an active Mongoose connection', () => {
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('should insert and retrieve documents in memory', async () => {
    const item = await TestItemModel.create({ name: 'Chomp Test', count: 42 });
    expect(item._id).toBeDefined();
    expect(item.name).toBe('Chomp Test');
    expect(item.count).toBe(42);

    const retrieved = await TestItemModel.findById(item._id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Chomp Test');
  });

  it('should isolate tests by clearing collections between runs', async () => {
    const count = await TestItemModel.countDocuments();
    expect(count).toBe(0);
  });

  it('should commit multi document transactions successfully', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await TestItemModel.create([{ name: 'Tx Commit', count: 100 }], { session });
      });
    } finally {
      await session.endSession();
    }

    const found = await TestItemModel.findOne({ name: 'Tx Commit' });
    expect(found).not.toBeNull();
    expect(found?.count).toBe(100);
  });

  it('should abort multi document transactions and rollback on error', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await TestItemModel.create([{ name: 'Tx Rollback', count: 200 }], { session });
        throw new Error('Simulated transaction failure');
      });
    } catch {
      // Expected error caught to verify rollback
    } finally {
      await session.endSession();
    }

    const found = await TestItemModel.findOne({ name: 'Tx Rollback' });
    expect(found).toBeNull();
  });
});
