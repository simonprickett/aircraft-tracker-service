import * as sbs1 from 'sbs1';
import * as redis from 'redis';

const SBS1_HOST = process.env.SBS1_HOST || 'localhost';
const SBS1_PORT = parseInt(process.env.SBS1_PORT, 10) || 30003;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = redis.createClient({
  url: REDIS_URL
});

await redisClient.connect();

const sbs1Client = sbs1.createClient({
  host: SBS1_HOST,
  port: SBS1_PORT
});

sbs1Client.on('message', (msg) => {
  console.log(msg);
});