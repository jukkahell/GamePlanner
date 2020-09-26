export const parseStringArgs = (input: string) => {
    const regex = new RegExp('"[^"]+"|[\\S]+', "g");
    const parsedArgs: any = [];
    if (input.match(regex)) {
      input.match(regex).forEach((element) => {
        if (!element) return;
        return parsedArgs.push(element.replace(/"/g, ""));
      });
    }
    return parsedArgs;
}