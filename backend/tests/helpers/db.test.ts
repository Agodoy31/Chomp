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
});
