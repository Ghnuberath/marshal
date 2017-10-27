# Marshal

A small container which automatically updates docker services within a stack. Must be run on a swarm master.

Currently tested on Docker Engine API 1.30.x.

## Usage

Drop `ghnuberath/marshal` into your stack:

*docker-compose.yml*
```yaml
version: '3'

services:
  my-service:
    #...
  marshal:
    marshal:
    image: ghnuberath/marshal:1.0.0
    environment:
      STACK_NAME: 'my-stack'
      REFRESH_INTERVAL: 30000
    depends_on:
      - redis
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    deploy:
      restart_policy:
        condition: any
        delay: 5s
        window: 15s
```

Then, deploy your stack:
```bash
docker stack deploy -c docker-compose.yml my-stack
```

Services will automatically update whenever a new image is available.

## Developing

### Dev Environment Setup
```
docker swarm init
```

### Run the test stack
```bash
# build test container
docker build -t ghnuberath/testing-marshal --no-cache ./test
# build marshal
docker build -t ghnuberath/marshal .
# deploy stack
docker stack deploy -c docker-compose.yml marshal-test
# rebuild test container
docker build -t ghnuberath/testing-marshal --no-cache ./test
# watch it redeploy
docker service logs -f marshal-test_marshal
# remove stack when you're done
docker stack rm marshal-test
```
