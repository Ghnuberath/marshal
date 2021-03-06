# Marshal

A small container which automatically updates docker services within a stack. Must be run on a swarm master.

Currently tested on Docker Engine API 1.30.x.

## Usage

Drop `smcintyre/marshal` into your stack:

*docker-compose.yml*
```yaml
version: '3'

services:
  my-service:
    #...
  marshal:
    marshal:
    image: smcintyre/marshal:1.3.1
    environment:
      STACK_NAME: 'my-stack'
      REFRESH_INTERVAL: 30000
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

## Private Registry Support

To support pulling images from a private registry, mount the host's docker configuration into the marshal container (replacing `user` with the appropriate user from your host machine):

*docker-compose.yml*
```yaml
version: '3'

services:
  #...
  marshal:
    # ...
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/<user>/.docker/config.json:/config.json
```

## Developing

### Dev Environment Setup
```
docker swarm init
```

### Run the test stack
```bash
# run registry
docker run -d -p 5000:5000 --restart always --name registry registry:2
# build, push, rm test container
docker build -t localhost:5000/testing-marshal --no-cache ./test && docker push localhost:5000/testing-marshal && docker rmi localhost:5000/testing-marshal
# build marshal
docker build -t smcintyre/marshal:1.3.1 .
# deploy stack
docker stack deploy -c docker-compose.yml marshal-test
# rebuild, push, rm test container
docker build -t localhost:5000/testing-marshal --no-cache ./test && docker push localhost:5000/testing-marshal && docker rmi localhost:5000/testing-marshal
# watch it redeploy
docker service logs -f marshal-test_marshal
# remove stack when you're done
docker stack rm marshal-test
# remove registry
docker rm -f registry
```
