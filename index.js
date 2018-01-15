var mn = require('mininet')({stdio: 'inherit', prefixStdio: true})
var tape = require('tape')
var pending = []

tape.onFinish(function () {
  mn.stop()
})

test.mininet = mn
test.hosts = mn.hosts
test.switches = mn.switches

test.createSwitch = function () {
  return mn.createSwitch()
}

test.createHost = function () {
  return mn.createHost()
}

test.createController = function () {
  return mn.createController()
}

module.exports = test

function test (name, fn) {
  tape(name, function (t) {
    if (!mn.started) {
      mn.on('start', ready)
      mn.start()
    } else {
      ready()
    }

    function ready () {
      t.run = run

      var missing = pending.length
      if (!missing) fn(t)

      pending.forEach(function (proc) {
        proc.on('close', function () {
          if (!--missing) {
            pending = []
            fn(t)
          }
        })
        proc.kill()
      })
    }

    function run (host, src) {
      var hostFilename = require.resolve('mininet/host')

      if (typeof src === 'function') src = ';(' + src.toString() + ')()'

      var proc = host.spawnNode(`
        var EventEmitter = require('events').EventEmitter
        var host = require('${hostFilename}')
        var target = {}
        var ip = '${host.ip}'
        var mac = '${host.mac}'

        global.t = new Proxy({}, {
          get: function (target, name) {
            return function (...args) {
              host.send('test', {name, args})
            }
          }
        })

        var handler =  
        vm.runInNewContext(
          ${JSON.stringify(src)},
          new Proxy(target, {
            get: function (target, name) {
              if (global.hasOwnProperty(name)) return global[name]
              if (target.hasOwnProperty(name)) return target[name]
              if (!/^h\\d$/.test(name)) return
              var e = target[name] = createEmitter(name)
              return e
            }
          }),
          {filename: '[${host.id}-test]'}
        )

        function createEmitter (id) {
          var e = new EventEmitter()
          e.id = id
          e.emit = function (...args) {
            EventEmitter.prototype.emit.apply(this, arguments)
            host.broadcast(id + ':emit', args)
            return true
          }
          host.on('message:' + id + ':emit', function (args) {
            EventEmitter.prototype.emit.apply(e, args)
          })
          return e
        }
      `)

      proc.on('message:test', function (data) {
        t[data.name].apply(t, data.args)
      })

      return proc
    }
  })
}