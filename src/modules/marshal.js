'use strict';

const Module = require('ravel').Module;
const inject = require('ravel').inject;
const prelisten = Module.prelisten;
const preclose = Module.preclose;

@inject('fs', 'dockerode')
class Marshal extends Module {
  constructor (fs, Dockerode) {
    super();
    this.fs = fs;
    const dockerConfig = this.params.get('docker connection config');
    this.docker = new Dockerode(dockerConfig);
    this.auths = new Map();
  }

  @prelisten
  async readAuth () {
    return new Promise((resolve, reject) => {
      this.fs.readFile('/config.json', {flag: 'r'}, (err, data) => {
        try {
          if (!err) {
            const authJSON = JSON.parse(data);
            Object.keys(authJSON.auths)
            .filter(a => authJSON.auths[a].auth !== undefined) // defensive driving
            .forEach(a => {
              const base64Auth = (new Buffer(authJSON.auths[a].auth, 'base64')).toString().split(':');
              this.auths.set(a, {
                username: base64Auth[0],
                password: base64Auth[1]
              });
            });
          }
        } catch (err) {
          this.log.warn('Unable to parse Docker config.json');
          this.log.warn(err.stack);
        } finally {
          resolve();
        }
      });
    });
  }

  listServices () {
    return new Promise((resolve, reject) => {
      const opts = {
        filters: `{"label": ["com.docker.stack.namespace=${this.params.get('stack name')}"]}`
      };
      this.docker.listServices(opts, (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      });
    });
  }

  getRegistryFromImage (imageName) {
    return imageName.substring(0, imageName.indexOf('/'));
  }

  pullImage (imageName) {
    return new Promise((resolve, reject) => {
      const args = [imageName];
      const registryName = this.getRegistryFromImage(imageName);
      if (this.auths.has(registryName)) {
        args.push({'authconfig': this.auths.get(registryName)});
      }
      args.push((err, stream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (err, result) => {
          if (err) return reject(err);
          return resolve(result);
        });
      });
      // initiate pull
      this.docker.pull(...args);
    });
  }

  async checkForUpdates (imageDigestName, serviceCreationTime) {
    const sha = imageDigestName.indexOf('@');
    const imageName = sha >= 0 ? imageDigestName.substring(0, sha) : imageDigestName;
    this.log.debug(`Checking for updates for ${imageName}`);
    try {
      await this.pullImage(imageName);
    } catch (err) {
      this.log.warn(`Unable to pull new image for ${imageName}.`);
      this.log.trace(err);
    }
    return new Promise((resolve, reject) => {
      const opts = {
        digests: 1,
        // filters: `{"reference": ["${imageName}"], "since": ["${imageDigestName}"]}`
        filters: `{"reference": ["${imageName}"]}`
      };
      this.docker.listImages(opts, (err, result) => {
        if (err) return reject(err);
        resolve(result.filter(i => {
          return serviceCreationTime < new Date(i.Created * 1000);
        }).length > 0);
      });
    });
  }

  inspectService (serviceDescriptor) {
    return new Promise((resolve, reject) => {
      try {
        const service = this.docker.getService(serviceDescriptor.ID);
        service.inspect((err, result) => {
          if (err) return reject(err);
          return resolve(result);
        });
      } catch (err) {
        this.log.error(`Could not inspect service.`);
        this.log.error(err.stack);
      }
    });
  }

  async updateService (serviceDescriptor) {
    const inspect = await this.inspectService(serviceDescriptor);
    const spec = Object.assign(inspect.Spec);
    spec.version = parseInt(inspect.Version.Index);
    spec.TaskTemplate.ForceUpdate = parseInt(spec.TaskTemplate.ForceUpdate) + 1;
    return new Promise((resolve, reject) => {
      try {
        const service = this.docker.getService(serviceDescriptor.ID);
        service.update(spec, (err, result) => {
          if (err) return reject(err);
          this.log.info(`Service ${spec.Name} updated.`);
          resolve(result);
        });
      } catch (err) {
        return reject(err);
      }
    });
  }

  async rollbackService (serviceDescriptor) {
    const inspect = await this.inspectService(serviceDescriptor);
    const spec = Object.assign(inspect.Spec);
    spec.rollback = 'previous';
    spec.version = parseInt(inspect.Version.Index);
    spec.TaskTemplate.ForceUpdate = parseInt(spec.TaskTemplate.ForceUpdate) + 1;
    return new Promise((resolve, reject) => {
      try {
        const service = this.docker.getService(serviceDescriptor.ID);
        service.update(spec, (err, result) => {
          if (err) return reject(err);
          this.log.info(`Service ${spec.Name} rolled back.`);
          resolve(result);
        });
      } catch (err) {
        return reject(err);
      }
    });
  }

  @prelisten
  retrieveStackName () {
    let busy = false;
    this.interval = setInterval(async () => {
      if (busy) return;
      const services = (await this.listServices())
        .filter(s => s.Spec.TaskTemplate.ContainerSpec.Image.indexOf('smcintyre/marshal') < 0);
      const toUpdate = (await Promise.all(services.map(s => {
        return this.checkForUpdates(s.Spec.TaskTemplate.ContainerSpec.Image, new Date(s.UpdatedAt)).then(isStale => {
          s.stale = isStale;
          return s;
        });
      }))).filter(s => s.stale);
      if (toUpdate.length === 0) {
        this.log.info('No services have updates.');
      } else {
        try {
          await Promise.all(toUpdate.map(s => {
            this.log.info(`Service ${s.Spec.Name} requires updating...`);
            return this.updateService(s);
          }));
        } catch (updateErr) {
          this.log.error('Could not update services');
          this.log.error(updateErr);
          try {
            await Promise.all(toUpdate.map(s => {
              this.log.info(`Rolling back update to service ${s.Spec.Name}...`);
              return this.rollbackService(s);
            }));
          } catch (rollbackErr) {
            this.log.error('Could not rollback services!');
            this.log.error(rollbackErr.stack);
          }
        } finally {
          busy = false;
        }
      }
    }, this.params.get('refresh interval'));
  }

  @preclose
  cleanupInterval () {
    this.interval && clearInterval(this.interval);
  }

}

module.exports = Marshal;
