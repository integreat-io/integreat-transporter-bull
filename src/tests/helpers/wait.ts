export default function wait(ms: number) {
  return new Promise((resolve, _reject) => {
    setTimeout(resolve, ms)
  })
}
