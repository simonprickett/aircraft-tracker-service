import * as sbs1 from 'sbs1';
import * as redis from 'redis';
import fetch from 'node-fetch';

const SBS1_HOST = process.env.SBS1_HOST || '127.0.0.1';
const SBS1_PORT = parseInt(process.env.SBS1_PORT, 10) || 30003;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;
const UNKNOWN_VALUE = 'unknown';

function getKeyForFlight(hexIdent) {
  return `flights:${hexIdent}`;
}

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

async function updateFlightDetails(hexIdent, callSign) {
  const FLIGHTAWARE_API_URL = `https://aeroapi.flightaware.com/aeroapi/flights/${callSign}?max_pages=1`;

  console.log(FLIGHTAWARE_API_URL);

  // Let's use Redis to remember what FlightAware API calls were made recently, so we
  // don't ask for details for a flight that we're already getting them for if multiple
  // messages for the same hexIdent/callSign come in at the same time.
  const detailsStatus = await redisClient.set(`flightaware:recent:${hexIdent}`, 'x', {
    NX: true,
    EX: 60
  });

  if (! detailsStatus) {
    console.log(`Not making FlightAware API call for ${callSign} as one was made recently.`);
    return;
  }

  try {
    const response = await fetch(FLIGHTAWARE_API_URL, {
      headers: {
        'Accept': 'application/json',
        'x-apikey': FLIGHTAWARE_API_KEY
      }
    });

    // TODO handle rate limiting on the FlightAware API... what's the response
    // code?
    if (response.status === 200) {
      const flightData = await response.json();
      const flightKey = getKeyForFlight(hexIdent);

      if (flightData && flightData.flights[0]) {
        const thisFlightData = flightData.flights[0];
        const dataToStore = {
          identIcao: thisFlightData.ident_icao ?? UNKNOWN_VALUE,
          identIata: thisFlightData.ident_iata ?? UNKNOWN_VALUE,
          operatorIcao: thisFlightData.operator_icao ?? UNKNOWN_VALUE,
          operatorIata: thisFlightData.operator_iata ?? UNKNOWN_VALUE,
          flightNumber: thisFlightData.flight_number ?? UNKNOWN_VALUE,
          registration: thisFlightData.registration ?? UNKNOWN_VALUE,
          originIcao: thisFlightData.origin.code_icao ?? UNKNOWN_VALUE,
          originIata: thisFlightData.origin.code_iata ?? UNKNOWN_VALUE,
          destinationIcao: thisFlightData.destination.code_icao ?? UNKNOWN_VALUE,
          destinationIata: thisFlightData.destination.code_iata ?? UNKNOWN_VALUE,
          aircraftType: thisFlightData.aircraft_type ?? UNKNOWN_VALUE
        };

        console.log(`Storing data for ${hexIdent}:`);
        console.log(dataToStore);
        redisClient.hSet(flightKey, {
          'hasFlightAware': 'true',
          ...dataToStore
        });
      } else {
        console.log(`FlightAware had no data for ${callSign}.`);
        redisClient.hSet(flightKey, {
          'hasFlightAware': 'false'
        });
      }
    } else {
      // TODO May need to consider setting something in the hash if the flight wasn't obtained from FlightAware...
      // Also consider the case where we didn't get anything because rate limiting kicked in.
      console.log('Non 200 response from FlightAware...');
    }
  } catch (e) {
    // TODO May need to consider setting something in the hash if the flight wasn't obtained from FlightAware...
    console.log('Error response from FlightAware:');
    console.error(e);
  }
}

async function saveFlight(flight) {
  const keyName = getKeyForFlight(flight.hexIdent);

  await redisClient.hSet(keyName, flight);
  redisClient.expire(keyName, 3600); // 3600 = 1hr in seconds.

  // If Redis has a callsign, latitude and longitude for this flight, and we 
  // didn't already gather the extra details from the FlightAware API then 
  // call the API to get them if possible.
  const [ callSign, latitude, longitude, hasFlightAware ] = await redisClient.hmGet(keyName, ['callSign', 'latitude', 'longitude', 'hasFlightAware']);

  if (callSign && latitude && longitude) {
    if (! hasFlightAware) {
      updateFlightDetails(flight.hexIdent, callSign);
    }
  }  
}

await redisClient.connect();

sbs1Client.on('message', (msg) => {
  if (msg.hex_ident) {
    const flight = {
      hexIdent: msg.hex_ident,
      lastUpdated: Math.floor(Date.now() / 1000)
    };

    if (msg.callsign) {
      flight.callSign = msg.callsign.trim();
    }

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
      saveFlight(flight);
    }
  }
});