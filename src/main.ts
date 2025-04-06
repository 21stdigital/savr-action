import { debug, getInput, setFailed, setOutput } from '@actions/core'

const wait = (milliseconds: number): Promise<string> => {
  return new Promise(resolve => {
    if (isNaN(milliseconds)) throw new Error('milliseconds is not a number')

    setTimeout(() => {
      resolve('done!')
    }, milliseconds)
  })
}

export const run = async (): Promise<void> => {
  try {
    const milliseconds: string = getInput('milliseconds')

    debug(`Waiting ${milliseconds} milliseconds ...`)

    debug(new Date().toLocaleTimeString())
    await wait(parseInt(milliseconds, 10))
    debug(new Date().toLocaleTimeString())

    setOutput('time', new Date().toLocaleTimeString())
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    }
  }
}
