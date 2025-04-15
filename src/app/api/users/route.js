import { getAllUsers } from "src\services\databaseService.js";

export async function GET() {
  try {
    const users = await getAllUsers();
    return new Response(JSON.stringify(users), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch users" }), { status: 500 });
  }
}
