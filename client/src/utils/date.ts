export const formatRelativeDate = (
  date: string,
): string => {
  const targetDate = new Date(date);
  const now = new Date();

  const differenceInMilliseconds =
    now.getTime() - targetDate.getTime();

  const differenceInSeconds = Math.floor(
    differenceInMilliseconds / 1000,
  );

  if (differenceInSeconds < 60) {
    return "just now";
  }

  const differenceInMinutes = Math.floor(
    differenceInSeconds / 60,
  );

  if (differenceInMinutes < 60) {
    return `${differenceInMinutes} ${
      differenceInMinutes === 1 ? "minute" : "minutes"
    } ago`;
  }

  const differenceInHours = Math.floor(
    differenceInMinutes / 60,
  );

  if (differenceInHours < 24) {
    return `${differenceInHours} ${
      differenceInHours === 1 ? "hour" : "hours"
    } ago`;
  }

  const differenceInDays = Math.floor(
    differenceInHours / 24,
  );

  if (differenceInDays < 7) {
    return `${differenceInDays} ${
      differenceInDays === 1 ? "day" : "days"
    } ago`;
  }

  return targetDate.toLocaleDateString();
};