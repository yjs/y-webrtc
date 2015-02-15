
gulp = require 'gulp'
uglify = require 'gulp-uglify'
plumber = require 'gulp-plumber'
browserify = require 'gulp-browserify'
rename = require 'gulp-rename'
ignore = require 'gulp-ignore'
jshint = require 'gulp-jshint'

paths =
  webrtc:   ['./lib/y-webrtc*.js']

buildConnector = (connector_name)->
  ()->
    gulp.src(paths[connector_name])
      .pipe plumber()
      .pipe jshint()
      .pipe jshint.reporter()

    gulp.src(paths[connector_name])
      .pipe(plumber())
      .pipe(browserify(
        insertGlobals: true
        debug: true
      ))
      .pipe gulp.dest('./build/browser/')
      .pipe uglify()
      .pipe gulp.dest('./')

    gulp.src './*.html'
      .pipe gulp.dest './build/browser/'

gulp.task 'build_node', ->
  gulp.src(['./lib/**'])
    .pipe plumber()
    .pipe gulp.dest './build/node/'

gulp.task 'webrtc', [], buildConnector 'webrtc'

gulp.task 'build_browser', ['webrtc']
gulp.task 'build', ['build_browser', 'build_node']

# Rerun the task when a file changes
gulp.task 'watch', ()->
  gulp.watch(paths.webrtc, ['webrtc'])

gulp.task('default', ['watch', 'build'])









