/**
  * Utility functions
  */
Array.prototype.indexOf = function(item)
{
  for (var i=0; i<this.length; i++)
  {
    if (this[i] == item)
      return i;
  }
  return -1;
}

function getPropOfArrayItem(prop, arr)
{
  if (!(arr instanceof Array)) return null;

  for (var i=0; i<arr.length; i++)
  {
    if (arr[i].key==prop)
      return arr[i].value;
  }
  return null;
}

function getFilenameFromPath(filepath)
{
  var filename = filepath.match(/.+\/([^/?]+)/);

  if (filename)
    filename = filename[1];

  return filename;
}

function trim(str)
{
  return str.replace(/^[\s\-]+|\s+$/, '');
}

function setPref(key, val)
{
  if (val === undefined) return;

  if (window.localStorage)
    return localStorage[key] = escape(val);
  else
    return widget.setPreferenceForKey(escape(val), key);
}

function getPref(key)
{
  if (window.localStorage)
    return unescape(localStorage[key]||'');
  else
    return unescape(widget.preferenceForKey(key)||'');
}

/**
  * File IO functions
  */
function readFile(f)
{
  // accepts file object or file path
  var
    Stream,
    str;

  if ( typeof f == 'string' )
  {
    f = SHARED_DIR.resolve(f);
  }

  if ( f && f.exists )
  {
    Stream = f.open(f, opera.io.filemode.READ)
    str = Stream.read( Stream.bytesAvailable );
    Stream.close();
    return str;
  }
  return null;
}

function writeFile(path, content, can_overwrite)
{
  var File;

  if ( path && content && (File=SHARED_DIR.resolve(path)) )
  {
    if (File.exists && !can_overwrite)
      return false;

    try {
      var stream = SHARED_DIR.open(path, opera.io.filemode.WRITE);
    } catch(e) {
      return false;
    }
    stream.write(content);
    stream.close();
    return File;
  }
  return false;
}

function createFile(path, content, overwrite)
{
  return writeFile(path, content, overwrite);
}

function deleteFile(filename)
{
  var File;

  if ( filename && (File=SHARED_DIR.resolve(filename))
       && File.exists && File.isFile )
  {
    ScriptsDirectory.hasChanged();
    return SHARED_DIR.deleteFile(File);
  }
  return false;
}

/**
  * Downloads file using synchronous XHR
  */
function downloadScript(uri)
{
  var xhr = new XMLHttpRequest();
  xhr.open('GET', uri, false);
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  try
  {
    xhr.send();
  }
  catch(e)
  {
    // will throw for local files for example
    return false;
  }

  // little validation to make sure it's javascript
  if ( xhr.getResponseHeader('Content-type').indexOf('javascript') == -1 )
    return false;

  if ( !xhr.responseText )
    return false;

  // extract file name from path
  var filename = uri.match(/.+\/([^/?]+)/);
  if ( filename )
    filename = filename[1];
  else
    return false;

  // create user script file
  return createFile(filename, xhr.responseText);
}
