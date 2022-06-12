import * as sbs1 from 'sbs1';
import * as redis from 'redis';

const SBS1_HOST = process.env.SBS1_HOST || 'localhost';
const SBS1_PORT = parseInt(process.env.SBS1_PORT, 10) || 30003;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;

if (! FLIGHTAWARE_API_KEY) {
  console.error('You must set the FLIGHTAWARE_API_KEY environment variable!');
  process.exit(1);
}

const redisClient = redis.createClient({
  url: REDIS_URL
});

const sbs1Client = sbs1.createClient({
  host: SBS1_HOST,
  port: SBS1_PORT
});

async function updateFlightDetails(callSign) {
  // TODO check it flights:callSign already has some property that tells us
  // that we have already looked it up on FlightAware...
  const FLIGHTAWARE_API_URL = `https://aeroapi.flightaware.com/aeroapi/flights/${callSign}`;
  // TODO set x-apikey header to FLIGHTAWARE_API_KEY
}

async function saveFlight(flight) {
  // TODO change this to save by flight number...
  const keyName = `flights:${flight.callSign}`
  
  await redisClient.hSet(keyName, flight);
  redisClient.expire(keyName, 3600); // 3600 = 1hr in seconds.

  // TODO call updateFlightDetails...
}

await redisClient.connect();

sbs1Client.on('message', (msg) => {
  if (msg.callsign) {
    const flight = {
      lastUpdated: Math.floor(Date.now() / 1000)
    };

    flight.callSign = msg.callsign.trim();

    if (msg.altitude !== null) {
      flight.altitude = msg.altitude;
    }

    if (msg.lat !== null) {
      flight.latitude = msg.lat;
    }

    if (msg.lon !== null) {
      flight.longitude = msg.lon;
    }

    if (flight.altitude || flight.latitude || flight.longitude) {
      console.log(flight);
      saveFlight(flight);
    }

    console.log(msg);
  }
});