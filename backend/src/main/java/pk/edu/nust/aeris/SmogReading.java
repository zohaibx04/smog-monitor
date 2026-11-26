package pk.edu.nust.aeris;
import jakarta.persistence.*;
import java.time.Instant;
@Entity
@Table(uniqueConstraints=@UniqueConstraint(columnNames={"areaId","timestamp","source"}))
public class SmogReading {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    public Long areaId;
    public Double aqi;
    public Double pm25;
    public Double pm10;
    public String source;
    @Column(length=500) public String providerLocation;
    public Instant timestamp;
}
