FROM node:20-alpine

# Next.js bakes the rewrites() destination into .next/routes-manifest.json
# at build time, so BACKEND_URL must be defined BEFORE `npm run build`
# runs. docker-compose passes this via build.args.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
