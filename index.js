/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var data_decoders = {
  pcm8: function (buffer, offset, output, channels, samples) {
    var input = new Uint8Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var data = input[pos++] - 128;
        output[ch][i] = data < 0 ? data / 128 : data / 127;
      }
    }
  },
  pcm16: function (buffer, offset, output, channels, samples) {
    var input = new Int16Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var data = input[pos++];
        output[ch][i] = data < 0 ? data / 32768 : data / 32767;
      }
    }
  },
  pcm24: function (buffer, offset, output, channels, samples) {
    var input = new Uint8Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var x0 = input[pos++];
        var x1 = input[pos++];
        var x2 = input[pos++];
        var xx = (x0 + (x1 << 8) + (x2 << 16));
        var data = xx > 0x800000 ? xx - 0x1000000 : xx;
        output[ch][i] = data < 0 ? data / 8388608 : data / 8388607;
      }
    }
  },
  pcm32: function (buffer, offset, output, channels, samples) {
    var input = new Int32Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var data = input[pos++];
        output[ch][i] = data < 0 ? data / 2147483648 : data / 2147483647;
      }
    }
  },
  pcm32f: function (buffer, offset, output, channels, samples) {
    var input = new Float32Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch)
        output[ch][i] = input[pos++];
    }
  },
  pcm64f: function (buffer, offset, output, channels, samples) {
    var input = new Float64Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch)
        output[ch][i] = input[pos++];
    }
  },
};

var data_encoders = {
  pcm8: function (buffer, offset, input, channels, samples) {
    var output = new Uint8Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v * 0.5 + 0.5) * 255) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm16: function (buffer, offset, input, channels, samples) {
    var output = new Int16Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 32768 : v * 32767) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm24: function (buffer, offset, input, channels, samples) {
    var output = new Uint8Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? 0x1000000 + v * 8388608 : v * 8388607) | 0;
        output[pos++] = (v >> 0) & 0xff;
        output[pos++] = (v >> 8) & 0xff;
        output[pos++] = (v >> 16) & 0xff;
      }
    }
  },
  pcm32: function (buffer, offset, input, channels, samples) {
    var output = new Int32Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        v = ((v < 0) ? v * 2147483648 : v * 2147483647) | 0;
        output[pos++] = v;
      }
    }
  },
  pcm32f: function (buffer, offset, input, channels, samples) {
    var output = new Float32Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
  pcm64f: function (buffer, offset, input, channels, samples) {
    var output = new Float64Array(buffer, offset);
    var pos = 0;
    for (var i = 0; i < samples; ++i) {
      for (var ch = 0; ch < channels; ++ch) {
        var v = Math.max(-1, Math.min(input[ch][i], 1));
        output[pos++] = v;
      }
    }
  },
};

function lookup(table, bitDepth, floatingPoint) {
  var name = 'pcm' + bitDepth + (floatingPoint ? 'f' : '');
  var fn = table[name];
  if (!fn)
    throw new TypeError('Unsupported data format: ' + name);
  return fn;
}

function decode(buffer) {
  var pos = 0, end = 0;
  if (buffer.buffer) {
    // If we are handed a typed array or a buffer, then we have to consider the
    // offset and length into the underlying array buffer.
    pos = buffer.byteOffset;
    end = buffer.length;
    buffer = buffer.buffer;
  } else {
    // If we are handed a straight up array buffer, start at offset 0 and use
    // the full length of the buffer.
    pos = 0;
    end = buffer.byteLength;
  }

  var v = new DataView(buffer);

  function u8() {
    var x = v.getUint8(pos);
    pos++;
    return x;
  }

  function u16() {
    var x = v.getUint16(pos, true);
    pos += 2;
    return x;
  }

  function u32() {
    var x = v.getUint32(pos, true);
    pos += 4;
    return x;
  }

  function string(len) {
    var str = '';
    for (var i = 0; i < len; ++i)
      str += String.fromCharCode(u8());
    return str;
  }

  if (string(4) !== 'RIFF')
    throw new TypeError('Invalid WAV file');
  u32();
  if (string(4) !== 'WAVE')
    throw new TypeError('Invalid WAV file');

  var fmt;

  while (pos < end) {
    var type = string(4);
    var size = u32();
    var next = pos + size;
    switch (type) {
    case 'fmt ':
      var formatId = u16();
      if (formatId !== 0x0001 && formatId !== 0x0003)
        throw new TypeError('Unsupported format in WAV file: ' + formatId.toString(16));
      fmt = {
        format: 'lpcm',
        floatingPoint: formatId === 0x0003,
        channels: u16(),
        sampleRate: u32(),
        byteRate: u32(),
        blockSize: u16(),
        bitDepth: u16(),
      };
      break;
    case 'data':
      if (!fmt)
        throw new TypeError('Missing "fmt " chunk.');
      var samples = Math.floor(size / fmt.blockSize);
      var channels = fmt.channels;
      var sampleRate = fmt.sampleRate;
      var channelData = [];
      for (var ch = 0; ch < channels; ++ch)
        channelData[ch] = new Float32Array(samples);
      lookup(data_decoders, fmt.bitDepth, fmt.floatingPoint)(buffer, pos, channelData, channels, samples);
      return {
        sampleRate: sampleRate,
        channelData: channelData
      };
      break;
    }
    pos = next;
  }
}

function encode(channelData, opts) {
  var sampleRate = opts.sampleRate || 16000;
  var floatingPoint = !!(opts.float || opts.floatingPoint);
  var bitDepth = floatingPoint ? 32 : ((opts.bitDepth | 0) || 16);
  var channels = channelData.length;
  var samples = channelData[0].length;
  var buffer = new ArrayBuffer(44 + (samples * channels * (bitDepth >> 3)));

  var v = new DataView(buffer);
  var pos = 0;

  function u8(x) {
    v.setUint8(pos++, x);
  }

  function u16(x) {
    v.setUint16(pos, x, true);
    pos += 2;
  }

  function u32(x) {
    v.setUint32(pos, x, true);
    pos += 4;
  }

  function string(s) {
    for (var i = 0; i < s.length; ++i)
      u8(s.charCodeAt(i));
  }

  // write header
  string('RIFF');
  u32(buffer.byteLength - 8);
  string('WAVE');

  // write 'fmt ' chunk
  string('fmt ');
  u32(16);
  u16(floatingPoint ? 0x0003 : 0x0001);
  u16(channels);
  u32(sampleRate);
  u32(sampleRate * channels * (bitDepth >> 3));
  u16(channels * (bitDepth >> 3));
  u16(bitDepth);

  // write 'data' chunk
  string('data');
  u32(buffer.byteLength - 44);
  lookup(data_encoders, bitDepth, floatingPoint)(buffer, pos, channelData, channels, samples);

  return Buffer(buffer);
}

module.exports = {
  decode: decode,
  encode: encode,
};
