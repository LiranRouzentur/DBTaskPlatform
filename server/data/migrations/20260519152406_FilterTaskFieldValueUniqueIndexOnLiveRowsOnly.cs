using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskPlatform.Data.migrations
{
    
    public partial class FilterTaskFieldValueUniqueIndexOnLiveRowsOnly : Migration
    {
        
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues",
                columns: new[] { "TaskId", "StatusFieldSpecId" },
                unique: true,
                filter: "[IsDeleted] IS NULL");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues",
                columns: new[] { "TaskId", "StatusFieldSpecId" },
                unique: true);
        }
    }
}
