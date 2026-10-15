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

interface TestLog {
  action: string;
  timestamp: Date;
}

const testLogSchema = new Schema<TestLog>({
  action: { type: String, required: true },
  timestamp: { type: Date, required: true, default: Date.now },
});

const TestLogModel = model<TestLog>('TestLog', testLogSchema);

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

  it('should commit multi document and multi collection transactions successfully', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await TestItemModel.create([{ name: 'Tx Commit Item 1', count: 100 }], { session });
        await TestItemModel.create([{ name: 'Tx Commit Item 2', count: 200 }], { session });
        await TestLogModel.create([{ action: 'BATCH_CREATE' }], { session });
      });
    } finally {
      await session.endSession();
    }

    const itemCount = await TestItemModel.countDocuments();
    const logCount = await TestLogModel.countDocuments();
    expect(itemCount).toBe(2);
    expect(logCount).toBe(1);

    const logEntry = await TestLogModel.findOne({ action: 'BATCH_CREATE' });
    expect(logEntry).not.toBeNull();
  });

  it('should abort multi collection transactions and rollback all writes on error', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await TestItemModel.create([{ name: 'Tx Rollback Item 1', count: 300 }], { session });
        await TestItemModel.create([{ name: 'Tx Rollback Item 2', count: 400 }], { session });
        await TestLogModel.create([{ action: 'ROLLBACK_ACTION' }], { session });
        throw new Error('Simulated transaction failure');
      });
    } catch {
      // Expected error caught to verify rollback
    } finally {
      await session.endSession();
    }

    const itemCount = await TestItemModel.countDocuments();
    const logCount = await TestLogModel.countDocuments();
    expect(itemCount).toBe(0);
    expect(logCount).toBe(0);
  });
});
