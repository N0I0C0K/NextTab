function matchCronPart(val: number, patten: string): boolean {
  const valStr = val.toString()
  if (patten === '*') {
    return true
  }
  if (patten.includes('/')) {
    const [, step] = patten.split('/')
    return val % Number.parseInt(step) === 0
  } else {
    return patten.split(',').some(part => {
      if (part.includes('-')) {
        const [lt, rt] = part.split('-')
        return Number.parseInt(lt) <= val && val <= Number.parseInt(rt)
      } else {
        return part === valStr
      }
    })
  }
}

export function matchCrontab(datetime: Date, patten: string): boolean {
  const raw = [datetime.getMinutes(), datetime.getHours(), datetime.getDate(), datetime.getMonth(), datetime.getDay()]
  return patten.split(' ').every((partPatten, idx) => matchCronPart(raw[idx], partPatten))
}
