'use strict';

const gulp = require('gulp');
const spawn = require('child_process').spawn;
const del = require('del');
const plugins = require('gulp-load-plugins')();

const babelConfig = {
  'retainLines': true,
  plugins: ['transform-decorators-legacy']
};

gulp.task('clean', function () {
  return del(['dist/**']);
});

gulp.task('lint', function () {
  return gulp.src(['./src/**/*.js', 'gulpfile.js'])
             .pipe(plugins.eslint())
             .pipe(plugins.eslint.format())
             .pipe(plugins.eslint.failAfterError());
});

gulp.task('build', ['lint', 'clean'], (done) => {
  gulp.src('src/**/*.js')
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.babel(babelConfig))
    .on('error', (e) => {
      console.error(e.stack);
      this.emit('end');
    })
    .pipe(plugins.sourcemaps.write('.'))
    .pipe(gulp.dest('dist'))
    .on('end', done);
});

// BEGIN watch stuff
let server;
gulp.task('serve', ['build'], () => {
  if (server) {
    server.kill();
  }
  server = spawn('node', ['--inspect=0.0.0.0:5858', '--nolazy', 'app.js'], {
    stdio: 'inherit',
    cwd: 'dist',
    env: process.env
  });
  server.on('close', (code) => {
    if (code > 0) {
      console.error('Error detected, waiting for changes...'); // eslint-disable-line no-console
    }
  });
});
process.on('exit', () => {
  if (server) {
    server.kill();
  }
});
gulp.task('watch', ['serve'], function () {
  gulp.watch('src/**/*.js', {interval: 1000, mode: 'poll'}, ['serve']); // run tests on file save
  gulp.watch('/.ravelrc.json', {interval: 1000, mode: 'poll'}, ['serve']);
});
// END watch stuff

gulp.task('default', ['watch']);
