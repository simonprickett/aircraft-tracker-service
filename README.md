# aircraft-tracker-service
Aircraft Tracking Service that uses dump1090

## Get the Code and Install Dependencies

```bash
git clone https://github.com/simonprickett/aircraft-tracker-service.git
cd aircraft-tracker-service
npm install
```

## Start Redis

```bash
docker-compose up -d
```

## Start the Server

With nodemon:

```bash
npm run dev
```

Without nodemon:

```bash
npm start
```