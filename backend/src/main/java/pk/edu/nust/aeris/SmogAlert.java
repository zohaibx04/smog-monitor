package pk.edu.nust.aeris;
import jakarta.persistence.*;
import java.time.Instant;
@Entity
public class SmogAlert {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    public Long areaId;
    public Long preferenceId;
    public Long readingId;
    public String message;
    public String status = "Active";
    public Instant createdAt;
}
